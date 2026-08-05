/**
 * The SQLite ledger is opened by two independent SQLite libraries in one process: `node:sqlite`, which
 * writes it, and the copy DuckDB's `sqlite_scanner` links in, which federates it. A read-write ATTACH
 * makes the second one take ownership of the WAL and unlink `-wal`/`-shm` out from under the first.
 *
 * Measured consequence of that, before this suite existed: every ingestion returned 201 with a
 * truthful `processedCount`, `node:sqlite` read its own rows back, and yet the rows existed nowhere
 * any other reader could see them. The materialiser — reading through DuckDB — inserted 0 tax lots
 * from a ledger the API had just written, and a restart discarded the orphaned WAL entirely. No layer
 * raised an error at any point, because at the SQL level nothing had gone wrong.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../../src/sqlite/migrations.js';

/** No foreign keys of its own, so a row is a one-statement commit. */
const INSERT_ASSET = `
  INSERT INTO assets (id, symbol, is_fiat, created_at, updated_at)
  VALUES (?, ?, 0, datetime('now', 'utc'), datetime('now', 'utc'))
`;

let dir: string;
let ledgerPath: string;
let writer: DatabaseSync;
let duckDb: DuckDbAdapter;

/** What any process other than the writer can see — the only definition of "persisted" that counts. */
function readFromAnotherConnection(): number {
  const reader = new DatabaseSync(ledgerPath, { readOnly: true });
  try {
    const row = reader.prepare('SELECT count(*) AS c FROM assets').get() as { c: number };
    return Number(row.c);
  } finally {
    reader.close();
  }
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wal-coexistence-'));
  ledgerPath = path.join(dir, 'ledger.db');

  writer = new DatabaseSync(ledgerPath);
  writer.exec('PRAGMA journal_mode = WAL;');
  writer.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(writer);
  writer.prepare(INSERT_ASSET).run('BTC', 'BTC');

  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = ':memory:';
  duckDb = new DuckDbAdapter();
  await duckDb.initialize(ledgerPath);
});

afterEach(() => {
  writer.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a DuckDB attach coexisting with the node:sqlite writer', () => {
  it('leaves the writer\'s WAL in place', () => {
    expect(fs.existsSync(`${ledgerPath}-wal`)).toBe(true);
    expect(fs.existsSync(`${ledgerPath}-shm`)).toBe(true);
  });

  it('keeps rows written after the attach visible to every other connection', () => {
    writer.prepare(INSERT_ASSET).run('ETH', 'ETH');

    const ownReadback = writer.prepare('SELECT count(*) AS c FROM assets').get() as { c: number };
    expect(Number(ownReadback.c)).toBe(2);
    // The assertion that fails under a read-write attach: the writer reads its own rows back either
    // way, so only a second connection distinguishes "persisted" from "written to a dead inode".
    expect(readFromAnotherConnection()).toBe(2);
  });

  it('lets DuckDB read a row the writer committed after the attach', async () => {
    writer.prepare(INSERT_ASSET).run('ETH', 'ETH');

    const row = await duckDb.queryOne<{ c: number | bigint }>(
      'SELECT count(*) AS c FROM ledger.assets',
    );
    expect(Number(row?.c)).toBe(2);
  });
});
