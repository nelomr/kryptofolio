/**
 * Regression for the production incident this change fixes: `FifoMaterializerService.recalculate()`
 * is a full set difference against the DuckDB-derived chain, so running it against a chain that was
 * not rebuilt in the same run (an empty placeholder after a process restart) retires every derived
 * row. Design D4a's fix is ownership: `FifoChainFreshnessService` is the only caller of
 * `recalculate()`, and it always rebuilds the chain immediately before reconciling it.
 *
 * A real file-backed DuckDB database is used (not `:memory:`) so a process restart can be simulated
 * by closing one `DuckDbAdapter` instance and opening a fresh one over the same file — an in-memory
 * database cannot demonstrate "the file that outlives the process" at all.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDbAdapter } from '@kryptofolio/database';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter.js';
import { DuckDbTaxCalculatorAdapter } from '../../../infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';
import { DuckDbDerivedChainAdapter } from '../../../infrastructure/adapters/DuckDbDerivedChainAdapter.js';
import { FifoMaterializerService } from '../FifoMaterializerService.js';
import { FifoChainFreshnessService } from '../FifoChainFreshnessService.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

const ACCOUNT = 'acc-restart-incident';

function fakeUserSettings(initial: Record<string, string> = {}): IUserSettingsPort & {
  readonly store: Record<string, string>;
} {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async getSetting(key: string) {
      return store[key] ?? null;
    },
    async setSetting(key: string, value: string) {
      store[key] = value;
    },
  };
}

function seedLedger(db: DatabaseSync): void {
  const asset = db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('BTC', 'BTC', 0);
  asset.run('EUR', 'EUR', 1);
  db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)').run(
    ACCOUNT,
    'Kraken',
    'exchange',
  );

  const insert = db.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
       total_fiat, price_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'COMPLETED')`,
  );

  insert.run(
    'tx-buy-1',
    'h-buy-1',
    ACCOUNT,
    'BUY',
    'BTC',
    '1.0',
    null,
    null,
    '20000.00',
    '20000.00',
    '2023-01-01T10:00:00Z',
  );
  insert.run(
    'tx-buy-2',
    'h-buy-2',
    ACCOUNT,
    'BUY',
    'BTC',
    '0.5',
    null,
    null,
    '11000.00',
    '22000.00',
    '2023-02-01T10:00:00Z',
  );
}

/** Live (non-soft-deleted) row counts for the three derived tables. */
function liveCounts(sqliteDb: DatabaseSync): Record<string, number> {
  const tables = ['tax_lots', 'lot_history_events', 'lot_custody_entries'] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = sqliteDb
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL`)
      .get() as { n: number };
    counts[table] = row.n;
  }
  return counts;
}

describe('derived-state pipeline survives a process restart (production incident regression)', () => {
  const created: string[] = [];
  let sqliteDb: DatabaseSync;
  let sqlitePath: string;
  let ledger: SQLiteLedgerAdapter;
  let duckDbPath: string;
  let firstDuckDb: DuckDbAdapter;
  let firstMaterializer: FifoMaterializerService;
  let firstFreshness: FifoChainFreshnessService;
  let settings: ReturnType<typeof fakeUserSettings>;

  beforeEach(async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sqlitePath = path.join(os.tmpdir(), `restart_incident_ledger_${suffix}.db`);
    duckDbPath = path.join(os.tmpdir(), `restart_incident_analytical_${suffix}.duckdb`);
    created.push(sqlitePath, duckDbPath);

    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    ledger = new SQLiteLedgerAdapter(sqliteDb);
    await ledger.initialize();
    seedLedger(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;

    firstDuckDb = new DuckDbAdapter();
    await firstDuckDb.initialize(sqlitePath);

    settings = fakeUserSettings({ needs_recalculation: 'true' });
    firstMaterializer = new FifoMaterializerService(ledger, new DuckDbTaxCalculatorAdapter(firstDuckDb));
    firstFreshness = new FifoChainFreshnessService(
      settings,
      new DuckDbDerivedChainAdapter(firstDuckDb),
      firstMaterializer,
    );
  });

  afterEach(() => {
    sqliteDb.close();
    for (const p of created) {
      for (const f of [p, `${p}.wal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    created.length = 0;
    delete process.env.DUCKDB_PATH;
  });

  it('does not retire derived rows across a restart with a clean flag', async () => {
    await firstFreshness.refresh();
    const before = liveCounts(sqliteDb);
    expect(before.tax_lots).toBeGreaterThan(0);

    // Simulate a restart: close the DuckDB connection, then open a fresh adapter over the same
    // file — this is what `initialize()` resets to an empty placeholder after a real restart.
    firstDuckDb.getInstance().closeSync();

    const secondDuckDb = new DuckDbAdapter();
    await secondDuckDb.initialize(sqlitePath);
    const secondMaterializer = new FifoMaterializerService(
      ledger,
      new DuckDbTaxCalculatorAdapter(secondDuckDb),
    );
    const secondFreshness = new FifoChainFreshnessService(
      settings,
      new DuckDbDerivedChainAdapter(secondDuckDb),
      secondMaterializer,
    );

    // The dangerous case: a clean flag survived (it lives in SQLite, untouched by the DuckDB
    // restart), so only `refresh()` owning its own rebuild — not a bare `recalculate()` — can
    // save this from reconciling against the empty placeholder tables.
    await settings.setSetting('needs_recalculation', 'false');
    const { materialization } = await secondFreshness.refresh();

    for (const table of ['taxLots', 'lotHistoryEvents', 'custodyEntries'] as const) {
      expect(materialization[table].retired).toBe(0);
    }
    expect(liveCounts(sqliteDb)).toEqual(before);

    secondDuckDb.getInstance().closeSync();
  });

  it('ingestion materialises its own batch through the freshness pipeline', async () => {
    // Mirrors what IngestAndMaterializeUseCase does: persist, mark pending, then refresh — the
    // sequence CsvIngestionE2E.spec.ts exercises through the real ingestion stack.
    await ledger.saveSpotTransaction({
      id: 'tx-buy-3',
      id_hash: 'h-buy-3',
      account_id: ACCOUNT,
      tx_type: 'BUY',
      asset_in_id: 'BTC',
      amount_in: toPreciseAmount('0.25'),
      total_fiat: toPreciseAmount('9000.00'),
      price_fiat: toPreciseAmount('36000.00'),
      fiat_currency: 'EUR',
      timestamp: '2023-03-01T10:00:00Z',
      status: 'COMPLETED',
    });
    await settings.setSetting('needs_recalculation', 'true');

    await firstFreshness.refresh();

    const lot = sqliteDb
      .prepare(
        `SELECT id FROM tax_lots WHERE spot_transaction_id = 'tx-buy-3' AND deleted_at IS NULL`,
      )
      .get() as { id: string } | undefined;
    expect(lot).toBeDefined();
    expect(await settings.getSetting('needs_recalculation')).toBe('false');
  });
});
