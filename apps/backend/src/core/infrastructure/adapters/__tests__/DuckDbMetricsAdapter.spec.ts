import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, applyMigrations } from '@kryptofolio/database';
import { DuckDbMetricsAdapter } from '../DuckDbMetricsAdapter.js';


describe('DuckDbMetricsAdapter', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let adapter: DuckDbMetricsAdapter;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_metrics_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full migration set, not a hand-picked prefix: the FIFO views bind against the current
    // ledger schema, and a partially-migrated ledger is not a schema the adapters support. Three
    // fixtures had to be converted mid-change after queries reached a column that arrives in 006.
    applyMigrations(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    adapter = new DuckDbMetricsAdapter(duckDb);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('should return default zero KPIs when portfolio has no transactions', async () => {
    const kpis = await adapter.getKpis('USD');
    expect(kpis.currency).toBe('USD');
    expect(Number(kpis.totalEquity)).toBe(0);
    expect(Number(kpis.maxDrawdownPct)).toBe(0);
    expect(kpis.delta24hFiat).toBe('0.00');
    expect(kpis.maxDrawdownFiat).toBe('0.00');
    expect(kpis.recoveredFiat).toBe('0.00');
    expect(kpis.winRatePercent).toBe(0);
    expect(kpis.totalTrades).toBe(0);
    expect(kpis.winningTrades).toBe(0);
    expect(kpis.losingTrades).toBe(0);
    expect(kpis.averageR).toBe(0);
    expect(kpis.bestAsset).toBeNull();
    expect(kpis.worstAsset).toBeNull();
    expect(kpis.totalRoiPercent).toBe(0);
    expect(kpis.totalRoiFiat).toBe('0.00');
  });

  it('should return drawdown curve and performance history from DuckDB views', async () => {
    const drawdown = await adapter.getDrawdownCurve(30, 'USD');
    expect(Array.isArray(drawdown)).toBe(true);

    const history = await adapter.getPerformanceHistory(30, 'USD');
    expect(Array.isArray(history)).toBe(true);
  });

  it('should return risk metrics including alpha and beta', async () => {
    const risk = await adapter.getRiskMetrics('USD');
    expect(risk.currency).toBe('USD');
    expect(risk).toHaveProperty('alpha');
    expect(risk).toHaveProperty('beta');
  });

  // ---------------------------------------------------------------------------
  // A flagged basis must not be summed into the headline figure
  // ---------------------------------------------------------------------------

  /**
   * Three open lots: one trustworthy, two carrying a valuation defect. The lots hang off crypto
   * DEPOSIT transactions on purpose — those generate no FIFO event, so the adapter's dual-source
   * `UNION` falls through to the materialised `ledger.tax_lots` rows, which is the branch whose
   * aggregation ignored `quality_flag` entirely.
   */
  const seedCleanAndFlaggedLots = (): void => {
    sqliteDb.exec(`
      INSERT INTO assets (id, symbol) VALUES ('BNB', 'BNB');
      INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Binance', 'exchange');

      INSERT INTO spot_transactions
        (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
      VALUES
        ('tx-clean', 'h-clean', 'acc-1', 'DEPOSIT', 'BNB', '1.0', '100.00', '100.00', 'EUR', '2023-01-01T10:00:00Z', 'COMPLETED'),
        ('tx-neg',   'h-neg',   'acc-1', 'DEPOSIT', 'BNB', '1.0', '0',      '0',      'EUR', '2023-01-02T10:00:00Z', 'COMPLETED'),
        ('tx-missing','h-missing','acc-1','DEPOSIT', 'BNB', '1.0', '0',      '0',      'EUR', '2023-01-03T10:00:00Z', 'COMPLETED');

      INSERT INTO tax_lots
        (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
         unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location,
         status, quality_flag)
      VALUES
        ('lot-clean',   'tx-clean',   'BNB', 'acc-1', '1.0', '1.0', '100.00', '100.00', 'EUR',
         '2023-01-01T10:00:00Z', 'Binance', 'OPEN', NULL),
        ('lot-neg',     'tx-neg',     'BNB', 'acc-1', '1.0', '1.0', '500.00', '500.00', 'EUR',
         '2023-01-02T10:00:00Z', 'Binance', 'OPEN', 'NEGATIVE_COST_BASIS'),
        ('lot-missing', 'tx-missing', 'BNB', 'acc-1', '1.0', '1.0', '700.00', '700.00', 'EUR',
         '2023-01-03T10:00:00Z', 'Binance', 'OPEN', 'MISSING_PRICE');
    `);
  };

  it('keeps a flagged cost basis out of totalCostBasis', async () => {
    seedCleanAndFlaggedLots();
    const kpis = await adapter.getKpis('EUR');
    expect(Number(kpis.totalCostBasis)).toBe(100);
  });

  it('reports the flagged lots separately rather than dropping them silently', async () => {
    seedCleanAndFlaggedLots();
    const kpis = await adapter.getKpis('EUR');
    expect(kpis.excludedFlaggedLots).toBe(2);
  });

  it('reports zero excluded lots when every basis is trustworthy', async () => {
    const kpis = await adapter.getKpis('EUR');
    expect(kpis.excludedFlaggedLots).toBe(0);
  });

  it('reads the ledger again on a second call rather than a cached snapshot', async () => {
    const before = await adapter.getKpis('EUR');
    expect(before.excludedFlaggedLots).toBe(0);

    seedCleanAndFlaggedLots();
    const after = await adapter.getKpis('EUR');

    expect(after.excludedFlaggedLots).toBe(2);
    expect(Number(after.totalCostBasis)).toBe(100);
  });
});
