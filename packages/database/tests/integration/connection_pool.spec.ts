/**
 * The fixed-size connection pool over the single `DuckDBInstance` (design D7). This is the
 * precondition that makes concurrent reads safe now that `getKpis`' temp-table pinning is
 * gone (section 9) — a pool with the pinning still in place would turn a latent currency race
 * into an active, nondeterministic one, which is why the two land together.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

interface Fixture {
  readonly sqliteDbPath: string;
  readonly duckDbPath: string;
  readonly adapter: DuckDbAdapter;
}

let fixture: Fixture | undefined;

async function buildFixture(poolSize?: string): Promise<Fixture> {
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `test_ledger_pool_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
  );
  const sqliteDb = new DatabaseSync(sqliteDbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(sqliteDb);
  sqliteDb.close();

  const duckDbPath = path.join(
    os.tmpdir(),
    `test_analytical_pool_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
  );
  process.env.MOCK_MODE = 'false';
  process.env.DUCKDB_PATH = duckDbPath;
  if (poolSize === undefined) {
    delete process.env.DUCKDB_POOL_SIZE;
  } else {
    process.env.DUCKDB_POOL_SIZE = poolSize;
  }

  const adapter = new DuckDbAdapter();
  await adapter.initialize(sqliteDbPath);
  return { sqliteDbPath, duckDbPath, adapter };
}

afterEach(() => {
  if (!fixture) return;
  for (const p of [fixture.sqliteDbPath, fixture.duckDbPath, `${fixture.duckDbPath}.wal`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  delete process.env.DUCKDB_POOL_SIZE;
  delete process.env.DUCKDB_PATH;
  fixture = undefined;
});

describe('DuckDbAdapter connection pool', () => {
  it('never opens more than DUCKDB_POOL_SIZE connections (default 4 when unset)', async () => {
    fixture = await buildFixture();

    const concurrentQueries = Array.from({ length: 12 }, (_, i) =>
      fixture!.adapter.queryOne(`SELECT ${i} AS n;`),
    );
    const peak = await fixture.adapter.debugPeakPoolSize();
    await Promise.all(concurrentQueries);

    expect(peak).toBeLessThanOrEqual(4);
    expect(await fixture.adapter.debugPeakPoolSize()).toBeLessThanOrEqual(4);
  });

  it('honours a configured DUCKDB_POOL_SIZE', async () => {
    fixture = await buildFixture('2');

    await Promise.all(
      Array.from({ length: 8 }, (_, i) => fixture!.adapter.queryOne(`SELECT ${i} AS n;`)),
    );

    expect(await fixture.adapter.debugPeakPoolSize()).toBeLessThanOrEqual(2);
  });

  it('grants queued waiters connections in arrival order (FIFO)', async () => {
    fixture = await buildFixture('1');

    const order: number[] = [];
    const gates: Array<() => void> = [];

    const makeSlowQuery = (id: number) =>
      fixture!.adapter.withPooledConnectionForTest(async () => {
        order.push(id);
        await new Promise<void>((resolve) => gates.push(resolve));
      });

    const first = makeSlowQuery(1);
    // Give the first call time to actually acquire the single connection before queuing more.
    await new Promise((r) => setTimeout(r, 10));
    const second = makeSlowQuery(2);
    await new Promise((r) => setTimeout(r, 10));
    const third = makeSlowQuery(3);
    await new Promise((r) => setTimeout(r, 10));

    // Release them one at a time, in order, and confirm each waiter is served next.
    gates[0]!();
    await first;
    await new Promise((r) => setTimeout(r, 10));
    gates[1]!();
    await second;
    await new Promise((r) => setTimeout(r, 10));
    gates[2]!();
    await third;

    expect(order).toEqual([1, 2, 3]);
  });

  it('returns a connection to the pool when a query throws, so a subsequent acquire succeeds', async () => {
    fixture = await buildFixture('1');

    await expect(fixture.adapter.execute('SELECT * FROM this_table_does_not_exist;')).rejects.toThrow();

    // If the failed query's connection was never released, this would hang or reject on
    // pool exhaustion instead of returning a real row.
    const row = await fixture.adapter.queryOne<{ n: number }>('SELECT 1 AS n;');
    expect(row?.n).toBe(1);
  });

  it('bulkInsert holds exactly one connection for the whole appender lifetime, and releases it on failure too', async () => {
    fixture = await buildFixture('1');
    await fixture.adapter.execute('CREATE TABLE bulk_pool_test (id INTEGER, name VARCHAR);');

    await fixture.adapter.bulkInsert('bulk_pool_test', [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);

    // The one pooled connection must be free again — a second bulkInsert (or any query) over a
    // pool of size 1 can only succeed if the first one released its connection.
    await fixture.adapter.bulkInsert('bulk_pool_test', [{ id: 3, name: 'c' }]);
    const rows = await fixture.adapter.queryMany('SELECT * FROM bulk_pool_test ORDER BY id;');
    expect(rows).toHaveLength(3);

    // And on a failed bulkInsert (nonexistent table), the connection must still come back.
    await expect(
      fixture.adapter.bulkInsert('no_such_table', [{ id: 1 }]),
    ).rejects.toThrow();
    const rowAfterFailure = await fixture.adapter.queryOne<{ n: number }>('SELECT 1 AS n;');
    expect(rowAfterFailure?.n).toBe(1);
  });

  it('holds no long-lived shared connection field after initialize()', async () => {
    fixture = await buildFixture();
    expect(fixture.adapter.debugHasLongLivedConnection()).toBe(false);
  });

  it('queries ledger.spot_transactions on a connection created well after initialize(), with no re-ATTACH (measurement 1.5)', async () => {
    fixture = await buildFixture('4');

    // Force the pool to grow past its first (bootstrap-derived) connection: fire more
    // concurrent queries than one connection can serve, so at least one brand-new
    // connection gets created lazily via acquireConnection(), long after initialize().
    const rows = await Promise.all(
      Array.from({ length: 4 }, () =>
        fixture!.adapter.queryOne<{ n: bigint }>(
          'SELECT COUNT(*) AS n FROM ledger.spot_transactions;',
        ),
      ),
    );

    expect(await fixture.adapter.debugPeakPoolSize()).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row?.n).toBe(0n);
    }
  });

  it('leaks no connection-scoped session state between pooled connections', async () => {
    fixture = await buildFixture('4');

    // Every one of these runs on whichever connection the pool happens to hand out —
    // if any per-connection setup (an ATTACH, a SET, a TEMP object) were missing on some
    // connections, this would fail non-deterministically across the four calls.
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        fixture!.adapter.queryOne<{ n: bigint }>(
          "SELECT COUNT(*) AS n FROM duckdb_views() WHERE view_name = 'v_custody_balances';",
        ),
      ),
    );

    for (const row of results) {
      expect(row?.n).toBe(1n);
    }
  });
});
