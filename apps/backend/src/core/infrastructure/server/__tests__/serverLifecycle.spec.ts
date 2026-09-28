/**
 * Real defect found in production: `index.ts` called `serve({ fetch: app.fetch, port })` without
 * ever capturing the returned server or listening for its `'error'` event. A port conflict
 * (`EADDRINUSE` — exactly what happens when a stale `tsx watch` process from a previous session is
 * still holding port 3001) throws asynchronously, well outside the surrounding `try/catch`, and with
 * no handler attached Node's default behavior is an unhandled-exception crash with no clear message
 * — and because it happens after the misleading "running on port" log already fired, it read as a
 * silent, unexplained death rather than "another instance is already using this port."
 *
 * `attachServerLifecycle` fixes the failure mode (loud, actionable EADDRINUSE handling) and the
 * accumulation mechanism (a graceful SIGTERM/SIGINT handler that actually closes the server, so a
 * `Ctrl+C` or `kill` frees the port immediately instead of leaving a live-but-deaf `tsx watch`
 * process that only shows up as one more zombie next time someone restarts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachServerLifecycle } from '../serverLifecycle';

function fakeLogger() {
  return { info: vi.fn(), fatal: vi.fn() };
}

/**
 * `hangsOpen: true` reproduces the exact hazard found while building this fix: `http.Server#close`
 * stops accepting NEW connections but its callback does not fire until every already-open
 * connection ends on its own — and the market-data SSE stream is deliberately long-lived, so a
 * connected frontend tab means `close()`'s callback would never fire on its own. Without
 * `closeAllConnections` and a hard timeout, the "graceful" shutdown this file exists to add would
 * itself become a new, permanent hang — worse than the unhandled-crash zombies it was meant to fix.
 */
function fakeServer(opts: { hangsOpen?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    close: (cb?: () => void) => void;
    closeAllConnections: () => void;
  };
  emitter.close = vi.fn((cb?: () => void) => {
    if (!opts.hangsOpen) cb?.();
    // else: never calls back, exactly like an open SSE connection keeping the server "closing"
    // forever — closeAllConnections (below) is what actually has to terminate it.
  });
  emitter.closeAllConnections = vi.fn();
  return emitter;
}

function fakeProcess() {
  const handlers = new Map<string, () => void>();
  return {
    on: vi.fn((signal: string, handler: () => void) => {
      handlers.set(signal, handler);
    }),
    exit: vi.fn(),
    trigger: (signal: string) => handlers.get(signal)?.(),
  };
}

describe('attachServerLifecycle', () => {
  it('logs "running on port" only once the server actually confirms listening, not optimistically before it', () => {
    const logger = fakeLogger();
    const server = fakeServer();
    attachServerLifecycle(server, { port: 3001, logger, process: fakeProcess() as never });

    expect(logger.info).not.toHaveBeenCalled();
    server.emit('listening');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('3001'));
  });

  it('on EADDRINUSE, logs a specific actionable message and exits(1) instead of crashing unhandled', () => {
    const logger = fakeLogger();
    const server = fakeServer();
    const proc = fakeProcess();
    attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

    const err = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    server.emit('error', err);

    expect(logger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      expect.stringContaining('already in use'),
    );
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('on any other server error, still logs fatally and exits(1) rather than leaving an unhandled exception', () => {
    const logger = fakeLogger();
    const server = fakeServer();
    const proc = fakeProcess();
    attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    server.emit('error', err);

    expect(logger.fatal).toHaveBeenCalled();
    expect(proc.exit).toHaveBeenCalledWith(1);
  });

  it('closes the server and exits(0) on SIGTERM, so the port is actually freed instead of a lingering process', () => {
    const logger = fakeLogger();
    const server = fakeServer();
    const proc = fakeProcess();
    attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

    proc.trigger('SIGTERM');

    expect(server.close).toHaveBeenCalled();
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('closes the server and exits(0) on SIGINT too (Ctrl+C)', () => {
    const logger = fakeLogger();
    const server = fakeServer();
    const proc = fakeProcess();
    attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

    proc.trigger('SIGINT');

    expect(server.close).toHaveBeenCalled();
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  describe('shutdown against a long-lived open connection (the SSE stream)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('forcibly drops open connections instead of waiting on close() forever', () => {
      const logger = fakeLogger();
      const server = fakeServer({ hangsOpen: true });
      const proc = fakeProcess();
      attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

      proc.trigger('SIGTERM');

      expect(server.closeAllConnections).toHaveBeenCalled();
    });

    it('still exits(0) within a bounded timeout even if close() never calls back at all', () => {
      const logger = fakeLogger();
      const server = fakeServer({ hangsOpen: true });
      const proc = fakeProcess();
      attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

      proc.trigger('SIGTERM');
      expect(proc.exit).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(proc.exit).toHaveBeenCalledWith(0);
    });

    it('does not call exit twice when close() eventually calls back after the forced close', () => {
      const logger = fakeLogger();
      const server = fakeServer();
      const proc = fakeProcess();
      attachServerLifecycle(server, { port: 3001, logger, process: proc as never });

      proc.trigger('SIGTERM');
      vi.runAllTimers();

      expect(proc.exit).toHaveBeenCalledTimes(1);
    });
  });
});
