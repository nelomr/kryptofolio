import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  resolveDataRoot,
  resolveLedgerDbPath,
  resolveVaultDbPath,
  resolveAnalyticalDbPath,
  resolveParquetPricesPath,
} from '../src/dataPaths.js';

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');

const originalCwd = process.cwd();
const PATH_VARS = [
  'KRYPTOFOLIO_DATA_DIR',
  'LEDGER_DB_PATH',
  'VAULT_DB_PATH',
  'DUCKDB_PATH',
  'PARQUET_DATA_PATH',
] as const;
// Restored, not deleted: the suite's setup file exports `PARQUET_DATA_PATH`, and dropping it would
// leave a later test reading the real price tree.
const originalEnv = new Map(PATH_VARS.map(name => [name, process.env[name]]));

beforeEach(() => {
  for (const name of PATH_VARS) delete process.env[name];
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('resolveDataRoot', () => {
  it('finds the workspace root by its marker file, not by the marker being in cwd', () => {
    expect(fs.existsSync(path.join(WORKSPACE_ROOT, 'pnpm-workspace.yaml'))).toBe(true);
    expect(resolveDataRoot()).toBe(WORKSPACE_ROOT);
  });

  /**
   * The defect this module exists to remove: every path was `path.resolve(process.cwd(), '../../…')`,
   * so the same code produced a different file per directory the process happened to start in — and
   * a second, empty database appeared wherever it landed.
   */
  it('returns the same root from any working directory', () => {
    const fromRoot = resolveDataRoot();
    process.chdir(path.join(WORKSPACE_ROOT, 'packages/database'));
    expect(resolveDataRoot()).toBe(fromRoot);
    process.chdir(path.join(WORKSPACE_ROOT, 'apps/backend'));
    expect(resolveDataRoot()).toBe(fromRoot);
  });

  it('honours KRYPTOFOLIO_DATA_DIR, resolving a relative value against the workspace root', () => {
    process.env.KRYPTOFOLIO_DATA_DIR = '/srv/kryptofolio/data';
    expect(resolveDataRoot()).toBe('/srv/kryptofolio/data');

    process.env.KRYPTOFOLIO_DATA_DIR = 'var/data';
    process.chdir(path.join(WORKSPACE_ROOT, 'apps/backend'));
    expect(resolveDataRoot()).toBe(path.join(WORKSPACE_ROOT, 'var/data'));
  });
});

describe('the three database paths', () => {
  it('places every file in the data root, under its documented name', () => {
    expect(resolveLedgerDbPath()).toBe(path.join(WORKSPACE_ROOT, 'kryptofolio_ledger.db'));
    expect(resolveVaultDbPath()).toBe(path.join(WORKSPACE_ROOT, 'kryptofolio.db'));
    expect(resolveAnalyticalDbPath()).toBe(path.join(WORKSPACE_ROOT, 'fiscal.duckdb'));
  });

  it('lets an absolute env override win verbatim', () => {
    process.env.LEDGER_DB_PATH = '/tmp/other-ledger.db';
    process.env.VAULT_DB_PATH = '/tmp/other-vault.db';
    process.env.DUCKDB_PATH = '/tmp/other.duckdb';
    expect(resolveLedgerDbPath()).toBe('/tmp/other-ledger.db');
    expect(resolveVaultDbPath()).toBe('/tmp/other-vault.db');
    expect(resolveAnalyticalDbPath()).toBe('/tmp/other.duckdb');
  });

  /**
   * A relative override is anchored to the data root rather than the cwd. Anchoring it to the cwd is
   * what let `VAULT_DB_PATH=../../kryptofolio.db` mean two different files depending on who started
   * the process, and `:memory:` is a SQLite sentinel rather than a path, so it is never joined.
   */
  it('anchors a relative env override to the data root, and leaves :memory: alone', () => {
    process.chdir(path.join(WORKSPACE_ROOT, 'apps/backend'));
    process.env.LEDGER_DB_PATH = 'ledger.db';
    expect(resolveLedgerDbPath()).toBe(path.join(WORKSPACE_ROOT, 'ledger.db'));

    process.env.VAULT_DB_PATH = ':memory:';
    expect(resolveVaultDbPath()).toBe(':memory:');
  });
});

describe('resolveParquetPricesPath', () => {
  it('points at the seeded price tree, not one under whatever directory the process started in', () => {
    const expected = path.join(WORKSPACE_ROOT, 'data/historical/prices');
    expect(fs.existsSync(expected)).toBe(true);

    process.chdir(path.join(WORKSPACE_ROOT, 'apps/backend'));
    expect(resolveParquetPricesPath()).toBe(expected);
  });

  it('honours PARQUET_DATA_PATH, anchoring a relative value to the data root', () => {
    process.env.PARQUET_DATA_PATH = '/mnt/prices';
    expect(resolveParquetPricesPath()).toBe('/mnt/prices');

    process.env.PARQUET_DATA_PATH = 'alt/prices';
    expect(resolveParquetPricesPath()).toBe(path.join(WORKSPACE_ROOT, 'alt/prices'));
  });
});
