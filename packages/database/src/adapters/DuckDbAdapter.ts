import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import type { IAnalyticalDatabasePort } from '../ports/IAnalyticalDatabasePort.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DuckDbAdapter — Infrastructure adapter for the generic IAnalyticalDatabasePort
 *
 * Uses the new Neo API (@duckdb/node-api) for high-performance columnar OLAP queries.
 * Manages the connection lifecycle and executes schema creation.
 */
export class DuckDbAdapter implements IAnalyticalDatabasePort {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private dbPath: string;

  constructor() {
    const isMockMode = process.env.MOCK_MODE === 'true';
    this.dbPath = ':memory:';

    if (!isMockMode) {
      if (!process.env.DUCKDB_PATH) {
        throw new Error(
          '[DuckDbAdapter] CRITICAL: DUCKDB_PATH environment variable is not defined. Please set it in your .env file or environment.',
        );
      }
      this.dbPath = process.env.DUCKDB_PATH;
    }
  }

  public async initialize(ledgerDbPath?: string): Promise<void> {
    try {
      this.instance = await DuckDBInstance.create(this.dbPath);
      this.connection = await this.instance.connect();

      // Load the sqlite scanner extension
      await this.connection.run('INSTALL sqlite;');
      await this.connection.run('LOAD sqlite;');

      // Resolve the ledger database path
      let resolvedLedgerPath = ledgerDbPath || process.env.LEDGER_DB_PATH;
      if (!resolvedLedgerPath) {
        const paths = [
          path.resolve(process.cwd(), 'kryptofolio_ledger.db'),
          path.resolve(process.cwd(), '../../kryptofolio_ledger.db'),
          path.resolve(process.cwd(), '../kryptofolio_ledger.db'),
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) {
            resolvedLedgerPath = p;
            break;
          }
        }
        if (!resolvedLedgerPath) {
          resolvedLedgerPath = paths[0];
        }
      }

function sanitizeFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('[DuckDbAdapter] File path must be a non-empty string.');
  }
  if (filePath.includes('\0')) {
    throw new Error('[DuckDbAdapter] File path contains null bytes.');
  }
  return filePath.replace(/'/g, "''");
}

      // Attach the SQLite ledger database
      const safeLedgerPath = sanitizeFilePath(resolvedLedgerPath);
      await this.connection.run(
        `ATTACH '${safeLedgerPath}' AS ledger (TYPE SQLITE);`,
      );

      // -----------------------------------------------------------------------
      // Parquet Federation — historical_prices view
      // -----------------------------------------------------------------------
      // IMPORTANT: historical_prices must be created BEFORE any views that depend
      // on it (v_flattened_fifo_events, v_futures_realized_pnl, etc.) via ASOF JOIN.
      const parquetBase =
        process.env.PARQUET_DATA_PATH ||
        path.resolve(process.cwd(), 'data/historical/prices');

      const sentinelDir = path.join(parquetBase, 'year=1970');
      const sentinelFile = path.join(sentinelDir, 'prices.parquet');

      if (!fs.existsSync(parquetBase)) {
        fs.mkdirSync(parquetBase, { recursive: true });
      }

      const hasParquetFiles =
        fs.existsSync(parquetBase) &&
        fs.readdirSync(parquetBase).some((entry) => {
          const entryPath = path.join(parquetBase, entry);
          if (!fs.statSync(entryPath).isDirectory()) return false;
          return fs.readdirSync(entryPath).some((f) => f.endsWith('.parquet'));
        });

      const safeParquetBase = sanitizeFilePath(parquetBase);
      const safeSentinelFile = sanitizeFilePath(sentinelFile);

      if (!hasParquetFiles) {
        fs.mkdirSync(sentinelDir, { recursive: true });
        await this.connection.run(`
          COPY (
            SELECT
              CAST(NULL AS DATE)     AS date,
              CAST(NULL AS VARCHAR)  AS asset_id,
              CAST(NULL AS VARCHAR)  AS symbol,
              CAST(NULL AS DECIMAL(38,18)) AS open,
              CAST(NULL AS DECIMAL(38,18)) AS high,
              CAST(NULL AS DECIMAL(38,18)) AS low,
              CAST(NULL AS DECIMAL(38,18)) AS close,
              CAST(NULL AS DECIMAL(38,18)) AS volume,
              CAST(NULL AS VARCHAR)  AS currency,
              CAST(NULL AS INTEGER)  AS year
            LIMIT 0
          ) TO '${safeSentinelFile}' (FORMAT PARQUET);
        `);
      }

      await this.connection.run(`
        CREATE TEMP TABLE IF NOT EXISTS _price_seed (
          date DATE,
          asset_id VARCHAR,
          symbol VARCHAR,
          open DECIMAL(38,18),
          high DECIMAL(38,18),
          low DECIMAL(38,18),
          close DECIMAL(38,18),
          volume DECIMAL(38,18),
          currency VARCHAR,
          year INTEGER
        );

        CREATE OR REPLACE VIEW historical_prices AS
        SELECT * FROM read_parquet('${safeParquetBase}/*/*.parquet', hive_partitioning = true)
        UNION ALL
        SELECT * FROM _price_seed;
      `);

      // - asset_prices is superseded by historical_prices (Parquet federation + ASOF JOIN).
      // - live_prices real-time PnL is now computed in the Node.js layer, not DuckDB.

      // Tax Base routing views
      await this.connection.run(`
        CREATE OR REPLACE VIEW savings_base_yields AS
        SELECT
            id,
            account_id,
            tx_type,
            asset_in_id,
            CAST(amount_in AS DECIMAL(38,18)) AS amount_in,
            CAST(total_fiat AS DECIMAL(38,18)) AS total_fiat,
            timestamp,
            SUBSTR(CAST(timestamp AS VARCHAR), 1, 4) AS year
        FROM ledger.spot_transactions
        WHERE tx_type IN ('STAKING', 'EARN', 'DIVIDENDS', 'REWARD')
          AND status = 'COMPLETED'
          AND deleted_at IS NULL;
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW general_base_airdrops AS
        SELECT
            id,
            account_id,
            tx_type,
            asset_in_id,
            CAST(amount_in AS DECIMAL(38,18)) AS amount_in,
            CAST(total_fiat AS DECIMAL(38,18)) AS total_fiat,
            timestamp,
            SUBSTR(CAST(timestamp AS VARCHAR), 1, 4) AS year
        FROM ledger.spot_transactions
        WHERE tx_type IN ('AIRDROP', 'MINING')
          AND status = 'COMPLETED'
          AND deleted_at IS NULL;
      `);

      // - Replaced `settlement_asset_id = 'EUR'` and `fee_asset_id = 'EUR'` with
      //   checks against `ft.fiat_currency` (read from ledger column).
      // - Replaced correlated asset_prices subqueries with ASOF JOIN historical_prices.
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_futures_realized_pnl AS
        SELECT
            ft.id,
            ft.account_id,
            ft.symbol,
            CAST(CAST(ft.realized_pnl AS DOUBLE) * CAST(COALESCE(
                CASE
                    WHEN ft.settlement_asset_id = ft.fiat_currency THEN CAST(1 AS DECIMAL(38,18))
                    ELSE hp_settle.close
                END,
                CAST(1 AS DECIMAL(38,18))
            ) AS DOUBLE) AS DECIMAL(38,18)) AS pnl_fiat,
            CAST(CAST(COALESCE(ft.fee_amount, '0') AS DOUBLE) * CAST(COALESCE(
                CASE
                    WHEN ft.fee_asset_id = ft.fiat_currency THEN CAST(1 AS DECIMAL(38,18))
                    ELSE hp_fee.close
                END,
                CAST(1 AS DECIMAL(38,18))
            ) AS DOUBLE) AS DECIMAL(38,18)) AS fee_fiat,
            ft.timestamp,
            SUBSTR(CAST(ft.timestamp AS VARCHAR), 1, 4) AS year
        FROM ledger.futures_transactions ft
        ASOF LEFT JOIN historical_prices hp_settle
          ON hp_settle.symbol = ft.settlement_asset_id
         AND hp_settle.date <= CAST(SUBSTR(CAST(ft.timestamp AS VARCHAR), 1, 10) AS DATE)
        ASOF LEFT JOIN historical_prices hp_fee
          ON hp_fee.symbol = ft.fee_asset_id
         AND hp_fee.date <= CAST(SUBSTR(CAST(ft.timestamp AS VARCHAR), 1, 10) AS DATE)
        WHERE ft.status = 'COMPLETED'
          AND ft.realized_pnl IS NOT NULL
          AND ft.deleted_at IS NULL;
      `);

      // Create v_flattened_fifo_events view splitting swaps and handling fees
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_flattened_fifo_events AS
        -- Acquisitions (Task 2.3)
        -- fee cost basis: if fee is in ledger fiat currency, add directly; otherwise use ASOF JOIN historical_prices
        SELECT
            tx.id AS tx_id,
            tx.id_hash,
            tx.account_id,
            tx.timestamp,
            tx.asset_in_id AS asset_id,
            'ACQUISITION' AS event_type,
            CAST(PRINTF('%.12f', CAST(tx.amount_in AS DOUBLE)) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', CAST(tx.total_fiat AS DOUBLE)) AS DECIMAL(38,18)) + COALESCE(
                CASE
                    WHEN tx.fee_asset_id = tx.fiat_currency THEN CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE)) AS DECIMAL(38,18))
                    WHEN tx.fee_asset_id IS NOT NULL THEN
                        CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE) * CAST(COALESCE(hp_fee_acq.close, 0.0) AS DOUBLE)) AS DECIMAL(38,18))
                    ELSE CAST(0 AS DECIMAL(38,18))
                END,
                CAST(0 AS DECIMAL(38,18))
            ) AS total_fiat,
            CAST(PRINTF('%.12f', CAST(tx.price_fiat AS DOUBLE)) AS DECIMAL(38,18)) AS price_fiat
        FROM ledger.spot_transactions tx
        ASOF LEFT JOIN historical_prices hp_fee_acq
          ON hp_fee_acq.symbol = tx.fee_asset_id
         AND hp_fee_acq.date <= CAST(SUBSTR(CAST(tx.timestamp AS VARCHAR), 1, 10) AS DATE)
        WHERE tx.asset_in_id IS NOT NULL
          AND tx.tx_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP')
          AND tx.status = 'COMPLETED'
          AND tx.deleted_at IS NULL

        UNION ALL

        -- Disposals (Main)
        SELECT
            tx.id AS tx_id,
            tx.id_hash,
            tx.account_id,
            tx.timestamp,
            tx.asset_out_id AS asset_id,
            'DISPOSAL' AS event_type,
            CAST(PRINTF('%.12f', CAST(tx.amount_out AS DOUBLE)) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', CAST(tx.total_fiat AS DOUBLE)) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', CAST(tx.price_fiat AS DOUBLE)) AS DECIMAL(38,18)) AS price_fiat
        FROM ledger.spot_transactions tx
        WHERE tx.asset_out_id IS NOT NULL
          AND tx.tx_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP')
          AND tx.status = 'COMPLETED'
          AND tx.deleted_at IS NULL

        UNION ALL

        -- Disposals (Crypto Fees — excludes rows where fee is in the ledger fiat currency)
        SELECT
            tx.id AS tx_id,
            tx.id_hash,
            tx.account_id,
            tx.timestamp,
            tx.fee_asset_id AS asset_id,
            'DISPOSAL' AS event_type,
            CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE)) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE) * CAST(COALESCE(hp_fee_dis.close, 1.0) AS DOUBLE)) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', CAST(COALESCE(hp_fee_dis.close, 1.0) AS DOUBLE)) AS DECIMAL(38,18)) AS price_fiat
        FROM ledger.spot_transactions tx
        ASOF LEFT JOIN historical_prices hp_fee_dis
          ON hp_fee_dis.symbol = tx.fee_asset_id
         AND hp_fee_dis.date <= CAST(SUBSTR(CAST(tx.timestamp AS VARCHAR), 1, 10) AS DATE)
        WHERE tx.fee_asset_id IS NOT NULL
          AND tx.fee_asset_id != tx.fiat_currency
          AND tx.status = 'COMPLETED'
          AND tx.deleted_at IS NULL;
      `);

      // Create v_acquisitions, v_disposals, and v_fifo_matches views
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_acquisitions AS
        SELECT
            tx_id,
            id_hash,
            account_id,
            timestamp,
            asset_id,
            amount,
            total_fiat,
            CAST(PRINTF('%.12f', CAST(total_fiat AS DOUBLE) / CAST(amount AS DOUBLE)) AS DECIMAL(38,18)) AS unit_cost_fiat,
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) AS DOUBLE)) AS DECIMAL(38,18)) AS cum_amount,
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) - amount AS DOUBLE)) AS DECIMAL(38,18)) AS prev_cum_amount
        FROM v_flattened_fifo_events
        WHERE event_type = 'ACQUISITION';
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW v_disposals AS
        SELECT
            tx_id,
            id_hash,
            account_id,
            timestamp,
            asset_id,
            amount,
            total_fiat,
            CAST(PRINTF('%.12f', CAST(total_fiat AS DOUBLE) / CAST(amount AS DOUBLE)) AS DECIMAL(38,18)) AS unit_price_fiat,
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) AS DOUBLE)) AS DECIMAL(38,18)) AS cum_amount,
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) - amount AS DOUBLE)) AS DECIMAL(38,18)) AS prev_cum_amount
        FROM v_flattened_fifo_events
        WHERE event_type = 'DISPOSAL';
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW v_fifo_matches AS
        WITH matched_raw AS (
            SELECT
                md5(a.tx_id || '_' || d.tx_id || '_' || a.asset_id) AS id,
                a.tx_id AS acquisition_tx_id,
                d.tx_id AS disposal_tx_id,
                a.asset_id,
                a.account_id,
                CAST(
                    CASE
                        WHEN (
                            CASE WHEN a.cum_amount < d.cum_amount THEN a.cum_amount ELSE d.cum_amount END
                            - CASE WHEN a.prev_cum_amount > d.prev_cum_amount THEN a.prev_cum_amount ELSE d.prev_cum_amount END
                        ) > CAST(0 AS DECIMAL(38,18)) THEN
                            (
                                CASE WHEN a.cum_amount < d.cum_amount THEN a.cum_amount ELSE d.cum_amount END
                                - CASE WHEN a.prev_cum_amount > d.prev_cum_amount THEN a.prev_cum_amount ELSE d.prev_cum_amount END
                            )
                        ELSE CAST(0 AS DECIMAL(38,18))
                    END
                AS DECIMAL(38,18)) AS matched_amount,
                a.unit_cost_fiat,
                d.unit_price_fiat,
                d.timestamp AS disposal_date,
                a.timestamp AS acquisition_date
            FROM v_acquisitions a
            JOIN v_disposals d
              ON a.asset_id = d.asset_id
             AND a.prev_cum_amount < d.cum_amount
             AND a.cum_amount > d.prev_cum_amount
        )
        SELECT
            id,
            acquisition_tx_id,
            disposal_tx_id,
            asset_id,
            account_id,
            matched_amount,
            unit_cost_fiat,
            unit_price_fiat,
            CAST(CAST(unit_price_fiat - unit_cost_fiat AS DOUBLE) * CAST(matched_amount AS DOUBLE) AS DECIMAL(38,18)) AS gain_loss_fiat,
            disposal_date,
            acquisition_date
        FROM matched_raw;
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW v_calculated_tax_lots AS
        SELECT
            md5(a.id_hash || '_' || a.asset_id) AS id,
            a.tx_id AS spot_transaction_id,
            a.asset_id,
            COALESCE(ast.symbol, a.asset_id) AS symbol,
            a.account_id,
            CAST(a.amount AS VARCHAR) AS original_qty,
            CAST(a.amount - COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) AS VARCHAR) AS remaining_qty,
            CAST(a.unit_cost_fiat AS VARCHAR) AS unit_cost_fiat,
            CAST(a.total_fiat AS VARCHAR) AS total_cost_fiat,
            src_tx.fiat_currency AS fiat_currency,
            a.timestamp AS acquisition_timestamp,
            COALESCE(acc.name, 'Unknown') AS exchange_location,
            a.id_hash AS source_tx_id,
            CASE
                WHEN a.amount - COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) <= CAST(0.0000000000000001 AS DECIMAL(38,18)) THEN 'CLOSED'
                WHEN COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) > CAST(0 AS DECIMAL(38,18)) THEN 'PARTIAL'
                ELSE 'OPEN'
            END AS status
        FROM v_acquisitions a
        LEFT JOIN ledger.spot_transactions src_tx ON a.tx_id = src_tx.id
        LEFT JOIN ledger.assets ast ON a.asset_id = ast.id OR a.asset_id = ast.symbol
        LEFT JOIN (
            SELECT acquisition_tx_id, asset_id, CAST(SUM(matched_amount) AS DECIMAL(38,18)) AS total_matched
            FROM v_fifo_matches
            GROUP BY 1, 2
        ) m ON a.tx_id = m.acquisition_tx_id AND a.asset_id = m.asset_id
        LEFT JOIN ledger.accounts acc ON a.account_id = acc.id;
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW v_calculated_lot_history_events AS
        SELECT
            m.id,
            md5(a.id_hash || '_' || a.asset_id) AS tax_lot_id,
            m.disposal_tx_id AS spot_transaction_id,
            m.account_id,
            CAST(m.matched_amount AS VARCHAR) AS amount_from_lot,
            CAST(m.unit_price_fiat AS VARCHAR) AS sale_price_fiat,
            CAST(m.gain_loss_fiat AS VARCHAR) AS gain_loss_fiat,
            dis_tx.fiat_currency AS fiat_currency,
            1 AS is_taxable,
            NULL AS flag,
            NULL AS notes,
            m.disposal_date,
            COALESCE(ast.symbol, m.asset_id) AS asset_symbol,
            COALESCE(acc.name, m.account_id) AS exchange_name
        FROM v_fifo_matches m
        JOIN v_acquisitions a ON m.acquisition_tx_id = a.tx_id AND m.asset_id = a.asset_id
        LEFT JOIN ledger.spot_transactions dis_tx ON m.disposal_tx_id = dis_tx.id
        LEFT JOIN ledger.assets ast ON m.asset_id = ast.id OR m.asset_id = ast.symbol
        LEFT JOIN ledger.accounts acc ON m.account_id = acc.id;
      `);

      // -----------------------------------------------------------------------
      //  Time-Series & Risk Metric Views
      // -----------------------------------------------------------------------

      // Gap-less daily running balances per asset using GENERATE_SERIES & Window SUM
      await this.connection.run(`
        CREATE TABLE IF NOT EXISTS user_settings (
            key VARCHAR PRIMARY KEY,
            value VARCHAR
        );
        INSERT INTO user_settings (key, value) VALUES ('base_currency', 'USD') ON CONFLICT DO NOTHING;

        CREATE OR REPLACE VIEW v_daily_running_balances AS
        WITH daily_deltas AS (
            SELECT
                asset_id,
                CAST(SUBSTR(CAST(timestamp AS VARCHAR), 1, 10) AS DATE) AS date,
                CAST(amount AS DECIMAL(38,18)) AS qty_delta
            FROM v_flattened_fifo_events
            WHERE event_type = 'ACQUISITION'

            UNION ALL

            SELECT
                asset_id,
                CAST(SUBSTR(CAST(timestamp AS VARCHAR), 1, 10) AS DATE) AS date,
                -CAST(amount AS DECIMAL(38,18)) AS qty_delta
            FROM v_flattened_fifo_events
            WHERE event_type = 'DISPOSAL'

            UNION ALL

            SELECT
                l.asset_id,
                CAST(SUBSTR(CAST(l.acquisition_timestamp AS VARCHAR), 1, 10) AS DATE) AS date,
                CAST(l.original_qty AS DECIMAL(38,18)) AS qty_delta
            FROM ledger.tax_lots l
            WHERE l.spot_transaction_id IS NULL
               OR l.spot_transaction_id NOT IN (SELECT tx_id FROM v_flattened_fifo_events)
        ),
        asset_min_dates AS (
            SELECT asset_id, MIN(date) AS start_date
            FROM daily_deltas
            GROUP BY asset_id
        ),
        asset_grid AS (
            SELECT
                m.asset_id,
                CAST(d.range AS DATE) AS date
            FROM asset_min_dates m,
                 GENERATE_SERIES(m.start_date, CURRENT_DATE(), INTERVAL 1 DAY) d(range)
        ),
        daily_net AS (
            SELECT
                asset_id,
                date,
                SUM(qty_delta) AS net_qty
            FROM daily_deltas
            GROUP BY asset_id, date
        )
        SELECT
            g.asset_id,
            g.date,
            CAST(SUM(COALESCE(n.net_qty, CAST(0 AS DECIMAL(38,18)))) OVER (
                PARTITION BY g.asset_id
                ORDER BY g.date
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS DECIMAL(38,18)) AS running_balance
        FROM asset_grid g
        LEFT JOIN daily_net n ON g.asset_id = n.asset_id AND g.date = n.date;
      `);

      // Daily portfolio valuation via ASOF JOIN against historical_prices & exchange_rates
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_portfolio_daily_valuation AS
        WITH target_setting AS (
            SELECT COALESCE(MAX(value), 'USD') AS base_curr
            FROM user_settings
            WHERE key = 'base_currency'
        )
        SELECT
            b.date,
            b.asset_id,
            a.symbol,
            b.running_balance,
            COALESCE(hp.close, CAST(0 AS DECIMAL(38,18))) AS close_price,
            COALESCE(hp.currency, (SELECT base_curr FROM target_setting)) AS price_currency,
            CAST(
                CASE
                    WHEN hp.currency IS NULL OR hp.currency = (SELECT base_curr FROM target_setting) THEN 1.0
                    ELSE COALESCE(CAST(er.rate AS DOUBLE), 1.0)
                END
            AS DECIMAL(38,18)) AS fx_rate,
            CAST(
                CAST(b.running_balance AS DOUBLE) *
                CAST(COALESCE(hp.close, CAST(0 AS DECIMAL(38,18))) AS DOUBLE) *
                CASE
                    WHEN hp.currency IS NULL OR hp.currency = (SELECT base_curr FROM target_setting) THEN 1.0
                    ELSE COALESCE(CAST(er.rate AS DOUBLE), 1.0)
                END
            AS DECIMAL(38,18)) AS daily_value
        FROM v_daily_running_balances b
        JOIN ledger.assets a ON b.asset_id = a.id
        ASOF LEFT JOIN historical_prices hp
          ON hp.symbol = a.symbol
         AND hp.date <= b.date
        ASOF LEFT JOIN ledger.exchange_rates er
          ON er.pair = (hp.currency || '/' || (SELECT base_curr FROM target_setting))
         AND CAST(er.date AS DATE) <= b.date;
      `);

      // Rolling ATH & Drawdown % view
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_portfolio_ath_drawdown AS
        WITH daily_portfolio AS (
            SELECT
                date,
                SUM(daily_value) AS total_daily_value
            FROM v_portfolio_daily_valuation
            GROUP BY date
        ),
        ath_calc AS (
            SELECT
                date,
                total_daily_value,
                MAX(total_daily_value) OVER (
                    ORDER BY date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS rolling_ath
            FROM daily_portfolio
        )
        SELECT
            date,
            total_daily_value,
            rolling_ath,
            CAST(
                CASE
                    WHEN rolling_ath > CAST(0 AS DECIMAL(38,18)) THEN
                        (total_daily_value - rolling_ath) / rolling_ath
                    ELSE CAST(0 AS DECIMAL(38,18))
                END
            AS DECIMAL(38,18)) AS drawdown_pct
        FROM ath_calc;
      `);

      // Daily Returns & Annualized Volatility view
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_portfolio_returns_volatility AS
        WITH daily_portfolio AS (
            SELECT
                date,
                SUM(daily_value) AS total_daily_value
            FROM v_portfolio_daily_valuation
            GROUP BY date
        ),
        returns_calc AS (
            SELECT
                date,
                total_daily_value,
                LAG(total_daily_value) OVER (ORDER BY date) AS prev_daily_value,
                CASE
                    WHEN LAG(total_daily_value) OVER (ORDER BY date) > CAST(0 AS DECIMAL(38,18)) THEN
                        (total_daily_value - LAG(total_daily_value) OVER (ORDER BY date)) / LAG(total_daily_value) OVER (ORDER BY date)
                    ELSE CAST(0 AS DECIMAL(38,18))
                END AS daily_return
            FROM daily_portfolio
        )
        SELECT
            date,
            total_daily_value,
            CAST(daily_return AS DECIMAL(38,18)) AS daily_return,
            CAST(
                STDDEV(CAST(daily_return AS DOUBLE)) OVER (
                    ORDER BY date
                    ROWS BETWEEN 30 PRECEDING AND CURRENT ROW
                ) * SQRT(365.0)
            AS DECIMAL(38,18)) AS annualized_volatility_30d,
            CAST(
                STDDEV(CAST(daily_return AS DOUBLE)) OVER (
                    ORDER BY date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) * SQRT(365.0)
            AS DECIMAL(38,18)) AS annualized_volatility_all
        FROM returns_calc;
      `);

      // Alpha & Beta vs BTC benchmark view
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_portfolio_alpha_beta AS
        WITH btc_prices AS (
            SELECT
                date,
                close AS btc_close,
                LAG(close) OVER (ORDER BY date) AS prev_btc_close,
                CASE
                    WHEN LAG(close) OVER (ORDER BY date) > CAST(0 AS DECIMAL(38,18)) THEN
                        (close - LAG(close) OVER (ORDER BY date)) / LAG(close) OVER (ORDER BY date)
                    ELSE CAST(0 AS DECIMAL(38,18))
                END AS btc_return
            FROM historical_prices
            WHERE symbol = 'BTC'
        ),
        matched_returns AS (
            SELECT
                pr.date,
                CAST(pr.daily_return AS DOUBLE) AS p_ret,
                CAST(br.btc_return AS DOUBLE) AS btc_ret
            FROM v_portfolio_returns_volatility pr
            JOIN btc_prices br ON pr.date = br.date
            WHERE pr.daily_return IS NOT NULL AND br.btc_return IS NOT NULL
        ),
        stats AS (
            SELECT
                COVAR_POP(p_ret, btc_ret) AS covar,
                VAR_POP(btc_ret) AS var_btc,
                AVG(p_ret) AS avg_p,
                AVG(btc_ret) AS avg_btc
            FROM matched_returns
        )
        SELECT
            CAST(
                CASE
                    WHEN var_btc > 0 THEN covar / var_btc
                    ELSE 1.0
                END
            AS DECIMAL(38,18)) AS beta,
            CAST(
                CASE
                    WHEN var_btc > 0 THEN avg_p - ((covar / var_btc) * avg_btc)
                    ELSE 0.0
                END
            AS DECIMAL(38,18)) AS alpha
        FROM stats;
      `);
    } catch (err) {
      throw new Error(
        `[Database] Critical failure initializing DuckDB: ${err}`,
      );
    }
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.ensureConnection();
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params as any[]);
    }
    await stmt.run();
  }

  public async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const results = await this.queryMany<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  public async queryMany<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    this.ensureConnection();
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params as any[]);
    }
    const reader = await stmt.runAndReadAll();
    return reader.getRowObjects() as unknown as T[];
  }

  public async bulkInsert<T extends Record<string, unknown>>(
    table: string,
    data: T[],
  ): Promise<void> {
    this.ensureConnection();
    if (data.length === 0) return;

    // Fetch the table columns in their schema-defined order to ensure correct appending sequence
    const columnsInfo = await this.queryMany<{ column_name: string }>(
      'SELECT column_name FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position',
      [table],
    );

    if (columnsInfo.length === 0) {
      throw new Error(
        `[DuckDbAdapter] bulkInsert failed: Table '${table}' does not exist or has no columns.`,
      );
    }

    const columnNames = columnsInfo.map((c) => c.column_name);
    const appender = await this.connection!.createAppender(table);

    try {
      for (const row of data) {
        for (const colName of columnNames) {
          const val = row[colName];
          if (val === undefined || val === null) {
            appender.appendNull();
          } else {
            appender.appendValue(val as any);
          }
        }
        appender.endRow();
      }
      appender.flushSync();
    } finally {
      appender.closeSync();
    }
  }

  private ensureConnection(): void {
    if (!this.connection) {
      throw new Error(
        '[DuckDbAdapter] Connection not initialized. Did you call initialize()?',
      );
    }
  }
}
