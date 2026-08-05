import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the three database files live, resolved once and identically for every process.
 *
 * Each path used to be `path.resolve(process.cwd(), '../../<file>')`, which makes the *same* code
 * name a different file per directory a process is started from. That is not a tidiness problem: it
 * produced a second, empty `kryptofolio_ledger.db` under `packages/database/`, and a backend started
 * from the repository root would have written its ledger outside the repository entirely — while
 * every API call still reported success, because nothing about opening the wrong SQLite file fails.
 *
 * The anchor is this module's own location walked up to the workspace marker, so it holds whether the
 * package is consumed as source (`main: src/index.ts`, via tsx) or from `dist/`.
 */

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/** A SQLite sentinel, not a filesystem path — joining it would create a file literally named that. */
const IN_MEMORY = ':memory:';

const LEDGER_FILE = 'kryptofolio_ledger.db';
const VAULT_FILE = 'kryptofolio.db';
const ANALYTICAL_FILE = 'fiscal.duckdb';
const PARQUET_PRICES_DIR = path.join('data', 'historical', 'prices');

function findWorkspaceRoot(): string {
  let dir = import.meta.dirname;

  while (true) {
    if (fs.existsSync(path.join(dir, WORKSPACE_MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `[dataPaths] Could not locate ${WORKSPACE_MARKER} above ${import.meta.dirname}. ` +
          'Set KRYPTOFOLIO_DATA_DIR to an absolute directory to say where the databases live.',
      );
    }
    dir = parent;
  }
}

/**
 * The directory holding every database file. `KRYPTOFOLIO_DATA_DIR` exists for a deployment that
 * mounts its data elsewhere (a container volume); a relative value is anchored to the workspace root
 * rather than the cwd, so overriding it cannot reintroduce the cwd dependence this module removes.
 */
export function resolveDataRoot(): string {
  const workspaceRoot = findWorkspaceRoot();
  const override = process.env.KRYPTOFOLIO_DATA_DIR;
  if (!override) return workspaceRoot;
  return path.isAbsolute(override) ? override : path.join(workspaceRoot, override);
}

function resolveDbPath(envValue: string | undefined, fileName: string): string {
  if (envValue === IN_MEMORY) return IN_MEMORY;
  if (envValue && path.isAbsolute(envValue)) return envValue;
  const root = resolveDataRoot();
  return envValue ? path.join(root, envValue) : path.join(root, fileName);
}

/** The transactional SQLite ledger — the source of truth for every transaction row. */
export function resolveLedgerDbPath(): string {
  return resolveDbPath(process.env.LEDGER_DB_PATH, LEDGER_FILE);
}

/** The SQLite vault — encrypted credentials and user settings. */
export function resolveVaultDbPath(): string {
  return resolveDbPath(process.env.VAULT_DB_PATH, VAULT_FILE);
}

/** The DuckDB analytical database, rebuilt from the ledger on demand. */
export function resolveAnalyticalDbPath(): string {
  return resolveDbPath(process.env.DUCKDB_PATH, ANALYTICAL_FILE);
}

/**
 * The Hive-partitioned Parquet tree DuckDB federates for historical prices. Resolved the same way as
 * the databases: read from the cwd, a backend started in `apps/backend/` created and federated an
 * *empty* tree there while the seeded one sat at the workspace root, so every ASOF price lookup
 * resolved to nothing without a single query failing.
 */
export function resolveParquetPricesPath(): string {
  const override = process.env.PARQUET_DATA_PATH;
  if (override && path.isAbsolute(override)) return override;
  const root = resolveDataRoot();
  return override ? path.join(root, override) : path.join(root, PARQUET_PRICES_DIR);
}
