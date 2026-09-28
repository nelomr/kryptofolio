/**
 * Wires the two lifecycle gaps `serve()`'s bare return value left open (see the test file's header
 * for the production defect this fixes):
 *
 *  - `'error'` (most commonly `EADDRINUSE`, e.g. a stale process from a previous session still
 *    holding the port) is logged with a specific, actionable message and exits the process
 *    deliberately, instead of crashing as an unhandled exception with no clear cause.
 *  - `SIGTERM`/`SIGINT` close the server before exiting, so a `Ctrl+C` or an ordinary `kill`
 *    actually frees the port immediately — this is what stops a stopped dev server from lingering
 *    as a live-but-deaf process that the next `pnpm dev` then races against. `close()` alone is not
 *    enough: it only stops accepting NEW connections and its callback waits for every already-open
 *    one to end on its own — but the market-data SSE stream is deliberately long-lived, so with a
 *    frontend tab connected, `close()`'s callback would never fire by itself. `closeAllConnections`
 *    forcibly drops open connections immediately, and a bounded fallback timer exits regardless, so
 *    shutdown can never hang on a connection that was never going to close voluntarily.
 *
 * Infrastructure, not domain (rule 3 does not apply — this wires Node's `net`/`process` APIs, which
 * is exactly what this layer is for). Takes `process` as a parameter rather than importing the
 * global so the signal-handling and exit-code behavior is unit-testable without actually sending a
 * real signal to the test runner's own process.
 */
interface Logger {
  info: (msg: string) => void;
  fatal: (obj: Record<string, unknown>, msg: string) => void;
}

interface ProcessLike {
  on: (signal: string, handler: () => void) => void;
  exit: (code: number) => void;
}

/**
 * A minimal structural shape, not `node:http`'s `Server` type — @hono/node-server's `serve()`
 * returns a union of `http.Server`/`http2.Server` whose full overload sets don't structurally
 * match each other or a test double; only `on('error'|'listening', ...)` and `close(cb)` are used
 * here, so only those are required.
 */
interface CloseableServer {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  close: (callback?: () => void) => unknown;
  /**
   * Node 18.2+ (this project's pinned engine floor is 24.16.0): force-drops every open socket.
   * Optional only because `@hono/node-server`'s `ServerType` is a union that also includes
   * `http2.Server`, whose type declarations don't carry this method — `serve()` here is always
   * plain HTTP/1.1 in practice, so the fallback branch is a type-safety net, not a real code path.
   */
  closeAllConnections?: () => unknown;
}

/** How long to wait for a graceful close before exiting unconditionally. */
const SHUTDOWN_TIMEOUT_MS = 5000;

export function attachServerLifecycle(
  server: CloseableServer,
  opts: { port: number; logger: Logger; process: ProcessLike }
): void {
  const { port, logger, process: proc } = opts;

  server.on('listening', () => {
    logger.info(`Kryptofolio Backend running on port ${port}`);
  });

  server.on('error', (...args: unknown[]) => {
    const err = args[0] as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE') {
      logger.fatal(
        { err },
        `Port ${port} is already in use — another backend instance is likely still running ` +
          `(check \`lsof -i:${port}\` and stop it before starting a new one).`
      );
    } else {
      logger.fatal({ err }, `Failed to start the HTTP server on port ${port}.`);
    }
    proc.exit(1);
  });

  const shutdown = () => {
    let exited = false;
    const exitOnce = () => {
      if (exited) return;
      exited = true;
      proc.exit(0);
    };

    server.close(exitOnce);
    // Force-drop open connections (the SSE stream, above all) right away rather than waiting to
    // see if close()'s callback fires on its own — it may never.
    server.closeAllConnections?.();
    // Last-resort net: exit regardless if something still didn't converge within the bound.
    setTimeout(exitOnce, SHUTDOWN_TIMEOUT_MS).unref?.();
  };
  proc.on('SIGTERM', shutdown);
  proc.on('SIGINT', shutdown);
}
