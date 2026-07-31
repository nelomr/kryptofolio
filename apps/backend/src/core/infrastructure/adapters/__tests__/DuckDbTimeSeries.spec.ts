import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter } from '@kryptofolio/database';

const MIGRATION_001_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/001_vault_schema.sql',
  ),
  'utf-8',
);
const MIGRATION_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql',
  ),
  'utf-8',
);
const MIGRATION_003_SQL = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/database/migrations/sqlite/003_currency_schema.sql',
  ),
  'utf-8',
);
const MIGRATION_004_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/004_fifo_traceability.sql'),
  'utf-8',
);

function insertAccount(db: DatabaseSync, id: string, name: string) {
  db.prepare(
    `INSERT OR IGNORE INTO accounts (id, name, type) VALUES (?, ?, 'SPOT')`,
  ).run(id, name);
}
function insertAsset(db: DatabaseSync, id: string, symbol: string) {
  db.prepare(
    `INSERT OR IGNORE INTO assets (id, symbol, name) VALUES (?, ?, ?)`,
  ).run(id, symbol, symbol);
}
function insertTaxLot(
  db: DatabaseSync,
  opts: {
    id: string;
    txId: string;
    assetId: string;
    accountId: string;
    originalQty: string;
    remainingQty: string;
    unitCostFiat: string;
    fiatCurrency?: string;
    status?: string;
    acquisitionTimestamp: string;
  },
) {
  const totalCostFiat = (
    parseFloat(opts.originalQty) * parseFloat(opts.unitCostFiat)
  ).toString();

  db.prepare(
    `INSERT OR IGNORE INTO spot_transactions
     (id, id_hash, account_id, tx_type, status, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp)
     VALUES (?, ?, ?, 'BUY', 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.txId,
    opts.txId + '_hash',
    opts.accountId,
    opts.assetId,
    opts.originalQty,
    totalCostFiat,
    opts.unitCostFiat,
    opts.fiatCurrency ?? 'USD',
    opts.acquisitionTimestamp,
  );

  db.prepare(
    `INSERT INTO tax_lots
     (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty, unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, source_tx_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Binance', ?, ?)`,
  ).run(
    opts.id,
    opts.txId,
    opts.assetId,
    opts.accountId,
    opts.originalQty,
    opts.remainingQty,
    opts.unitCostFiat,
    totalCostFiat,
    opts.fiatCurrency ?? 'USD',
    opts.acquisitionTimestamp,
    opts.txId + '_hash',
    opts.status ?? 'OPEN',
  );
}

async function seedHistoricalPrice(
  duckDb: DuckDbAdapter,
  symbol: string,
  date: string,
  close: string,
  currency = 'USD',
) {
  await duckDb.execute(`INSERT INTO _price_seed (date, symbol, close, currency) VALUES (?, ?, ?, ?)`, [
    date,
    symbol,
    close,
    currency,
  ]);
}
async function refreshHistoricalPricesView(duckDb: DuckDbAdapter) {
  await duckDb.execute(`
    CREATE OR REPLACE VIEW historical_prices AS
    SELECT date, 'NONE' AS asset_id, symbol,
           CAST(NULL AS DECIMAL(38,18)) AS open, CAST(NULL AS DECIMAL(38,18)) AS high,
           CAST(NULL AS DECIMAL(38,18)) AS low, close,
           CAST(NULL AS DECIMAL(38,18)) AS volume, currency, YEAR(date) AS year
    FROM _price_seed;
  `);
}

describe('[Strict TDD] DuckDB Time-Series Views (Block 3)', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ts_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(MIGRATION_001_SQL);
    sqliteDb.exec(MIGRATION_SQL);
    sqliteDb.exec(MIGRATION_003_SQL);
    sqliteDb.exec(MIGRATION_004_SQL);
    sqliteDb
      .prepare(
        `INSERT OR REPLACE INTO user_settings (key, value) VALUES ('base_currency', 'USD')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    await duckDb.execute(
      `CREATE TEMP TABLE IF NOT EXISTS _price_seed (date DATE, symbol VARCHAR, close DECIMAL(38,18), currency VARCHAR);`,
    );
    await refreshHistoricalPricesView(duckDb);

    insertAccount(sqliteDb, 'acc1', 'Binance');
    insertAsset(sqliteDb, 'asset-btc', 'BTC');
    insertAsset(sqliteDb, 'asset-eth', 'ETH');
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  // v_daily_running_balances
  describe('v_daily_running_balances', () => {
    it('produces a gap-less 11-row timeline when first tx is 10 days ago', async () => {
      const daysAgo10 = new Date();
      daysAgo10.setDate(daysAgo10.getDate() - 10);
      const dateStr = daysAgo10.toISOString().split('T')[0]!;
      insertTaxLot(sqliteDb, {
        id: 'lot1',
        txId: 'tx1',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '1',
        remainingQty: '1',
        unitCostFiat: '30000',
        acquisitionTimestamp: dateStr + 'T00:00:00.000Z',
      });

      const rows = await duckDb.queryMany<{
        date: string;
        running_balance: string;
      }>(
        `SELECT date, running_balance FROM v_daily_running_balances WHERE asset_id = 'asset-btc' ORDER BY date`,
      );
      expect(rows.length).toBe(11);
      expect(rows[0]!.date.toString().substring(0, 10)).toBe(dateStr);
      expect(rows.every((r) => Number(r.running_balance) === 1)).toBe(true);
    });

    it('carries balance forward (no gaps) on days with no transactions', async () => {
      const d = new Date();
      d.setDate(d.getDate() - 5);
      const ds = d.toISOString().split('T')[0]!;
      insertTaxLot(sqliteDb, {
        id: 'lot2',
        txId: 'tx2',
        assetId: 'asset-eth',
        accountId: 'acc1',
        originalQty: '5',
        remainingQty: '5',
        unitCostFiat: '2000',
        acquisitionTimestamp: ds + 'T00:00:00.000Z',
      });

      const rows = await duckDb.queryMany<{ running_balance: string }>(
        `SELECT running_balance FROM v_daily_running_balances WHERE asset_id = 'asset-eth' ORDER BY date`,
      );
      expect(rows.length).toBe(6);
      expect(rows.every((r) => Number(r.running_balance) === 5)).toBe(true);
    });
  });

  // v_portfolio_daily_valuation
  describe('v_portfolio_daily_valuation', () => {
    it('daily_value = running_balance * close_price when same currency (no FX conversion)', async () => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      const ds = d.toISOString().split('T')[0]!;
      insertTaxLot(sqliteDb, {
        id: 'lot3',
        txId: 'tx3',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '2',
        remainingQty: '2',
        unitCostFiat: '40000',
        acquisitionTimestamp: ds + 'T00:00:00.000Z',
      });
      await seedHistoricalPrice(duckDb, 'BTC', ds, '50000', 'USD');
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ daily_value: string }>(
        `SELECT daily_value FROM v_portfolio_daily_valuation WHERE asset_id = 'asset-btc' AND CAST(date AS VARCHAR) = '${ds}'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(Number(rows[0]!.daily_value)).toBeCloseTo(100000, 2);
    });

    it('[ASOF JOIN] carries Friday price to Saturday when no weekend price exists', async () => {
      const today = new Date();
      let friday = new Date(today);
      friday.setDate(friday.getDate() - 7);
      while (friday.getDay() !== 5) friday.setDate(friday.getDate() - 1);
      const saturday = new Date(friday);
      saturday.setDate(friday.getDate() + 1);
      const fridayStr = friday.toISOString().split('T')[0]!;
      const satStr = saturday.toISOString().split('T')[0]!;

      insertTaxLot(sqliteDb, {
        id: 'lot-f',
        txId: 'tx-f',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '1',
        remainingQty: '1',
        unitCostFiat: '40000',
        acquisitionTimestamp: fridayStr + 'T00:00:00.000Z',
      });
      await seedHistoricalPrice(duckDb, 'BTC', fridayStr, '42000', 'USD');
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ daily_value: string }>(
        `SELECT daily_value FROM v_portfolio_daily_valuation WHERE asset_id = 'asset-btc' AND CAST(date AS VARCHAR) = '${satStr}'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]!.daily_value)).toBeCloseTo(42000, 2);
    });
  });

  // v_portfolio_ath_drawdown
  describe('v_portfolio_ath_drawdown', () => {
    it('drawdown_pct = -0.5 when value drops from 100k to 50k', async () => {
      const d5 = new Date();
      d5.setDate(d5.getDate() - 5);
      const d5s = d5.toISOString().split('T')[0]!;
      const todayStr = new Date().toISOString().split('T')[0]!;

      insertTaxLot(sqliteDb, {
        id: 'lot-d',
        txId: 'tx-d',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '1',
        remainingQty: '1',
        unitCostFiat: '50000',
        acquisitionTimestamp: d5s + 'T00:00:00.000Z',
      });
      await seedHistoricalPrice(duckDb, 'BTC', d5s, '100000', 'USD');
      await seedHistoricalPrice(duckDb, 'BTC', todayStr, '50000', 'USD');
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ drawdown_pct: string }>(
        `SELECT drawdown_pct FROM v_portfolio_ath_drawdown ORDER BY date DESC LIMIT 1`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]!.drawdown_pct)).toBeCloseTo(-0.5, 4);
    });

    it('drawdown_pct = 0 when at ATH', async () => {
      const d2 = new Date();
      d2.setDate(d2.getDate() - 2);
      const d2s = d2.toISOString().split('T')[0]!;
      const todayStr = new Date().toISOString().split('T')[0]!;

      insertTaxLot(sqliteDb, {
        id: 'lot-ath',
        txId: 'tx-ath',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '1',
        remainingQty: '1',
        unitCostFiat: '90000',
        acquisitionTimestamp: d2s + 'T00:00:00.000Z',
      });
      await seedHistoricalPrice(duckDb, 'BTC', d2s, '90000', 'USD');
      await seedHistoricalPrice(duckDb, 'BTC', todayStr, '100000', 'USD');
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ drawdown_pct: string }>(
        `SELECT drawdown_pct FROM v_portfolio_ath_drawdown ORDER BY date DESC LIMIT 1`,
      );
      expect(Number(rows[0]!.drawdown_pct)).toBeCloseTo(0, 4);
    });
  });

  // v_portfolio_returns_volatility
  describe('v_portfolio_returns_volatility', () => {
    it('daily_return = +25% when value goes from 80k to 100k', async () => {
      const d2 = new Date();
      d2.setDate(d2.getDate() - 2);
      const d2s = d2.toISOString().split('T')[0]!;
      const d1 = new Date();
      d1.setDate(d1.getDate() - 1);
      const d1s = d1.toISOString().split('T')[0]!;

      insertTaxLot(sqliteDb, {
        id: 'lot-r',
        txId: 'tx-r',
        assetId: 'asset-btc',
        accountId: 'acc1',
        originalQty: '1',
        remainingQty: '1',
        unitCostFiat: '80000',
        acquisitionTimestamp: d2s + 'T00:00:00.000Z',
      });
      await seedHistoricalPrice(duckDb, 'BTC', d2s, '80000', 'USD');
      await seedHistoricalPrice(duckDb, 'BTC', d1s, '100000', 'USD');
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ daily_return: string }>(
        `SELECT daily_return FROM v_portfolio_returns_volatility WHERE CAST(date AS VARCHAR) = '${d1s}'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]!.daily_return)).toBeCloseTo(0.25, 4);
    });
  });

  // v_portfolio_alpha_beta
  describe('v_portfolio_alpha_beta', () => {
    it('Beta = 1.0 when portfolio returns are identical to BTC returns', async () => {
      const prices = ['100', '110', '121', '133.1', '146.41'];
      const today = new Date();
      for (let i = 4; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const ds = d.toISOString().split('T')[0]!;
        await seedHistoricalPrice(duckDb, 'BTC', ds, prices[4 - i]!, 'USD');
        if (i === 4) {
          insertTaxLot(sqliteDb, {
            id: `lot-b${i}`,
            txId: `tx-b${i}`,
            assetId: 'asset-btc',
            accountId: 'acc1',
            originalQty: '1',
            remainingQty: '1',
            unitCostFiat: prices[0]!,
            acquisitionTimestamp: ds + 'T00:00:00.000Z',
          });
        }
      }
      await refreshHistoricalPricesView(duckDb);

      const rows = await duckDb.queryMany<{ beta: string }>(
        `SELECT beta FROM v_portfolio_alpha_beta`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]!.beta)).toBeCloseTo(1.0, 2);
    });
  });
});
