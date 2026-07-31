import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import {
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  FLAG_SEVERITIES,
  FLAG_SEVERITY,
  SYNTHETIC_ACCOUNT_PREFIX,
  fifoEventPolicyRows,
  type FifoQualityFlag,
} from '@kryptofolio/shared-types';
import type { IAnalyticalDatabasePort } from '../ports/IAnalyticalDatabasePort.js';
import { toDuckDbParams, toDuckDbValue } from './sqlParams.js';
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
  private custodyRelations: Promise<void> | null = null;

  private static readonly CUSTODY_RELATION_MENTION =
    /\b(v_custody_movements|v_lot_custody_timeline|v_lot_custody_allocation|v_custody_entries|v_lot_current_location|v_custody_balances|v_fifo_data_quality|duckdb_views)\b/i;

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
      this.custodyRelations = null;
      this.instance = await DuckDBInstance.create(this.dbPath);
      this.connection = await this.instance.connect();

      // Load the sqlite scanner extension
      await this.connection.run('INSTALL sqlite;');
      await this.connection.run('LOAD sqlite;');

      // A test runner already runs several files in parallel, each with its own DuckDB instance, so
      // DuckDB's default of one thread per core oversubscribes the machine several times over and
      // every query pays the scheduling for it. Honoured only when set, so production keeps the
      // default.
      const threadLimit = Number.parseInt(process.env.DUCKDB_THREADS ?? '', 10);
      if (Number.isInteger(threadLimit) && threadLimit > 0) {
        await this.connection.run(`SET threads = ${threadLimit};`);
      }

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

      await this.seedFifoEventPolicy();
      await this.seedFifoFlagSeverity();
      await this.createAccountNamingMacros();

      // -----------------------------------------------------------------------
      //  FIFO event flattening
      // -----------------------------------------------------------------------
      // Every branch's inclusion is a single boolean read from `fifo_event_policy`. The three
      // predicates this replaces were the same list written three times, and the copy guarding the
      // fee branch was never written at all — so a wallet transfer's whole principal was disposed of
      // while its fee went untaxed.
      //
      // Prices resolve in one order everywhere: the transaction's own recorded fiat magnitude, then
      // a manual override, then the market series. There is no fallback beyond that; an unresolved
      // price stays NULL and is flagged downstream, because a fabricated 1,00 €/unit is
      // indistinguishable from real data once it reaches a total.
      //
      // A single override row is keyed by transaction identity alone, so it is applied to whichever
      // asset the branch is valuing — the acquired asset, the disposed asset, or the fee asset.
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_flattened_fifo_events AS
        -- MATERIALIZED is not decoration. Every branch below reads this CTE, and each read that is
        -- inlined instead re-scans the attached SQLite ledger through the sqlite extension. Measured
        -- on an empty ledger, inlining cost roughly 2.3x the previous engine's query time; pinning
        -- the two ledger reads to one pass each brings it back in line.
        WITH fiat_assets AS MATERIALIZED (
            SELECT id FROM ledger.assets WHERE is_fiat = 1
        ),
        tx_context AS MATERIALIZED (
            SELECT
                t.id,
                t.id_hash,
                t.account_id,
                t.timestamp,
                t.asset_in_id,
                t.amount_in,
                t.asset_out_id,
                t.amount_out,
                t.fee_asset_id,
                t.fee_amount,
                t.fiat_currency,
                CAST(SUBSTR(CAST(t.timestamp AS VARCHAR), 1, 10) AS DATE) AS tx_date,
                TRY_CAST(t.total_fiat AS DOUBLE) AS recorded_fiat,
                TRY_CAST(t.amount_in AS DOUBLE)  AS qty_in,
                TRY_CAST(t.amount_out AS DOUBLE) AS qty_out,
                TRY_CAST(t.fee_amount AS DOUBLE) AS qty_fee,
                recorded_fiat IS NOT NULL AND recorded_fiat <> 0 AS has_recorded_fiat,
                p.generates_acquisition,
                p.generates_disposal,
                p.generates_fee_disposal,
                p.taxable_disposal,
                p.principal_disposal_type,
                TRY_CAST(ovr.price_fiat AS DOUBLE) AS override_unit_price,
                CASE WHEN ovr.price_fiat IS NOT NULL
                     THEN ovr.fiat_currency <> t.fiat_currency
                END AS override_currency_differs,
                fa_in.id  IS NOT NULL AS asset_in_is_fiat,
                fa_out.id IS NOT NULL AS asset_out_is_fiat,
                fa_fee.id IS NOT NULL AS fee_asset_is_fiat
            FROM ledger.spot_transactions t
            JOIN fifo_event_policy p ON p.tx_type = t.tx_type
            LEFT JOIN ledger.manual_price_overrides ovr
                   ON ovr.id_hash = t.id_hash AND ovr.deleted_at IS NULL
            LEFT JOIN fiat_assets fa_in  ON fa_in.id  = t.asset_in_id
            LEFT JOIN fiat_assets fa_out ON fa_out.id = t.asset_out_id
            LEFT JOIN fiat_assets fa_fee ON fa_fee.id = t.fee_asset_id
            WHERE t.status = 'COMPLETED'
              AND t.deleted_at IS NULL
        ),
        acquisition_priced AS (
            SELECT
                c.*,
                hp_in.close      AS market_price_in,
                hp_in.currency   AS market_currency_in,
                hp_fee.close     AS market_price_fee,
                hp_fee.currency  AS market_currency_fee
            FROM (
                SELECT * FROM tx_context
                WHERE generates_acquisition
                  AND asset_in_id IS NOT NULL
                  AND NOT asset_in_is_fiat
            ) c
            ASOF LEFT JOIN historical_prices hp_in
              ON hp_in.symbol = c.asset_in_id AND hp_in.date <= c.tx_date
            ASOF LEFT JOIN historical_prices hp_fee
              ON hp_fee.symbol = c.fee_asset_id AND hp_fee.date <= c.tx_date
        ),
        acquisition_resolved AS (
            SELECT
                a.*,
                COALESCE(a.override_unit_price, TRY_CAST(a.market_price_in AS DOUBLE)) AS derived_unit_price,
                CASE
                    WHEN a.fee_asset_id IS NULL THEN CAST(0 AS DOUBLE)
                    WHEN a.fee_asset_id = a.fiat_currency THEN a.qty_fee
                    ELSE a.qty_fee * TRY_CAST(a.market_price_fee AS DOUBLE)
                END AS fee_cost_component,
                CASE WHEN a.has_recorded_fiat THEN a.recorded_fiat
                     ELSE a.qty_in * derived_unit_price
                END + fee_cost_component AS basis_fiat
            FROM acquisition_priced a
        ),
        disposal_priced AS (
            SELECT
                c.*,
                hp_out.close     AS market_price_out,
                hp_out.currency  AS market_currency_out
            FROM (
                SELECT * FROM tx_context
                WHERE generates_disposal
                  AND asset_out_id IS NOT NULL
                  AND NOT asset_out_is_fiat
            ) c
            ASOF LEFT JOIN historical_prices hp_out
              ON hp_out.symbol = c.asset_out_id AND hp_out.date <= c.tx_date
        ),
        fee_priced AS (
            SELECT
                c.*,
                hp_fee.close     AS market_price_fee,
                hp_fee.currency  AS market_currency_fee
            FROM (
                SELECT * FROM tx_context
                WHERE generates_fee_disposal
                  AND fee_asset_id IS NOT NULL
                  AND fee_asset_id <> fiat_currency
                  AND NOT fee_asset_is_fiat
            ) c
            ASOF LEFT JOIN historical_prices hp_fee
              ON hp_fee.symbol = c.fee_asset_id AND hp_fee.date <= c.tx_date
        )
        SELECT
            id AS tx_id,
            id_hash,
            account_id,
            timestamp,
            asset_in_id AS asset_id,
            'ACQUISITION' AS event_type,
            CAST(PRINTF('%.12f', qty_in) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', basis_fiat) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', basis_fiat / NULLIF(qty_in, 0)) AS DECIMAL(38,18)) AS price_fiat,
            CAST(NULL AS VARCHAR) AS disposal_type,
            FALSE AS taxable_disposal,
            CASE WHEN NOT has_recorded_fiat AND override_unit_price IS NOT NULL
                 THEN 'MANUAL' ELSE 'MARKET'
            END AS value_provenance,
            COALESCE(
                CASE
                    WHEN has_recorded_fiat THEN FALSE
                    WHEN override_unit_price IS NOT NULL THEN override_currency_differs
                    ELSE market_currency_in <> fiat_currency
                END, FALSE
            ) OR COALESCE(
                CASE
                    WHEN fee_asset_id IS NOT NULL AND fee_asset_id <> fiat_currency
                    THEN market_currency_fee <> fiat_currency
                END, FALSE
            ) AS currency_mismatch
        FROM acquisition_resolved

        UNION ALL

        SELECT
            id AS tx_id,
            id_hash,
            account_id,
            timestamp,
            asset_out_id AS asset_id,
            'DISPOSAL' AS event_type,
            CAST(PRINTF('%.12f', qty_out) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', unit_price * qty_out) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', unit_price) AS DECIMAL(38,18)) AS price_fiat,
            principal_disposal_type AS disposal_type,
            taxable_disposal,
            CASE WHEN NOT has_recorded_fiat AND override_unit_price IS NOT NULL
                 THEN 'MANUAL' ELSE 'MARKET'
            END AS value_provenance,
            COALESCE(
                CASE
                    WHEN has_recorded_fiat THEN FALSE
                    WHEN override_unit_price IS NOT NULL THEN override_currency_differs
                    ELSE market_currency_out <> fiat_currency
                END, FALSE
            ) AS currency_mismatch
        FROM (
            SELECT
                d.*,
                CASE WHEN d.has_recorded_fiat AND d.qty_out IS NOT NULL AND d.qty_out <> 0
                     THEN d.recorded_fiat / d.qty_out
                     ELSE COALESCE(d.override_unit_price, TRY_CAST(d.market_price_out AS DOUBLE))
                END AS unit_price
            FROM disposal_priced d
        )

        UNION ALL

        -- Paying a network fee in crypto disposes of that crypto whatever the surrounding
        -- transaction does, which is why this branch reads its own policy flag and never the
        -- principal-disposal one. A fee settled in the ledger's own fiat currency is a cost, not a
        -- disposal, and is folded into the acquisition basis above instead.
        SELECT
            id AS tx_id,
            id_hash,
            account_id,
            timestamp,
            fee_asset_id AS asset_id,
            'DISPOSAL' AS event_type,
            CAST(PRINTF('%.12f', qty_fee) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', unit_price * qty_fee) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', unit_price) AS DECIMAL(38,18)) AS price_fiat,
            'FEE' AS disposal_type,
            TRUE AS taxable_disposal,
            CASE WHEN override_unit_price IS NOT NULL THEN 'MANUAL' ELSE 'MARKET' END AS value_provenance,
            COALESCE(
                CASE
                    WHEN override_unit_price IS NOT NULL THEN override_currency_differs
                    ELSE market_currency_fee <> fiat_currency
                END, FALSE
            ) AS currency_mismatch
        FROM (
            SELECT
                f.*,
                COALESCE(f.override_unit_price, TRY_CAST(f.market_price_fee AS DOUBLE)) AS unit_price
            FROM fee_priced f
        );
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
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) - amount AS DOUBLE)) AS DECIMAL(38,18)) AS prev_cum_amount,
            value_provenance,
            currency_mismatch
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
            CAST(PRINTF('%.12f', CAST(SUM(amount) OVER (PARTITION BY asset_id ORDER BY timestamp, tx_id) - amount AS DOUBLE)) AS DECIMAL(38,18)) AS prev_cum_amount,
            disposal_type,
            taxable_disposal,
            value_provenance,
            currency_mismatch
        FROM v_flattened_fifo_events
        WHERE event_type = 'DISPOSAL';
      `);

      // The cumulative-interval overlap join is the FIFO matcher and is unchanged. What is new is
      // that a match now carries the verdict on its own trustworthiness: a defect on either side
      // suppresses the gain rather than producing a figure the engine cannot justify. The precise
      // failure this prevents was measured: a −1,6724 €/XRP basis against a zero-priced transfer
      // disposal reported +299,46 € of profit.
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
                d.disposal_type,
                d.taxable_disposal,
                CASE WHEN a.value_provenance = 'MANUAL' OR d.value_provenance = 'MANUAL'
                     THEN 'MANUAL' ELSE 'MARKET'
                END AS value_provenance,
                COALESCE(a.currency_mismatch, FALSE) OR COALESCE(d.currency_mismatch, FALSE) AS currency_mismatch,
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
            disposal_type,
            taxable_disposal,
            value_provenance,
            currency_mismatch,
            CASE
                WHEN unit_cost_fiat < CAST(0 AS DECIMAL(38,18)) THEN 'NEGATIVE_COST_BASIS'
                WHEN currency_mismatch THEN 'CURRENCY_MISMATCH'
                WHEN unit_cost_fiat IS NULL OR unit_price_fiat IS NULL THEN 'MISSING_PRICE'
            END AS quality_flag,
            CASE WHEN quality_flag IS NULL
                 THEN CAST(CAST(unit_price_fiat - unit_cost_fiat AS DOUBLE) * CAST(matched_amount AS DOUBLE) AS DECIMAL(38,18))
            END AS gain_loss_fiat,
            disposal_date,
            acquisition_date
        FROM matched_raw;
      `);

      await this.connection.run(`
        CREATE OR REPLACE VIEW v_calculated_tax_lots AS
        WITH lot_base AS (
            SELECT
                md5(a.id_hash || '_' || a.asset_id) AS id,
                a.tx_id AS spot_transaction_id,
                a.asset_id,
                COALESCE(ast.symbol, a.asset_id) AS symbol,
                a.account_id,
                a.amount AS original_qty_num,
                COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) AS matched_qty,
                a.unit_cost_fiat AS raw_unit_cost_fiat,
                a.total_fiat AS raw_total_cost_fiat,
                src_tx.fiat_currency AS fiat_currency,
                a.timestamp AS acquisition_timestamp,
                COALESCE(acc.name, 'Unknown') AS exchange_location,
                a.id_hash AS source_tx_id,
                a.value_provenance,
                a.currency_mismatch
            FROM v_acquisitions a
            LEFT JOIN ledger.spot_transactions src_tx ON a.tx_id = src_tx.id
            LEFT JOIN ledger.assets ast ON a.asset_id = ast.id OR a.asset_id = ast.symbol
            LEFT JOIN (
                SELECT acquisition_tx_id, asset_id, CAST(SUM(matched_amount) AS DECIMAL(38,18)) AS total_matched
                FROM v_fifo_matches
                GROUP BY 1, 2
            ) m ON a.tx_id = m.acquisition_tx_id AND a.asset_id = m.asset_id
            LEFT JOIN ledger.accounts acc ON a.account_id = acc.id
        )
        SELECT
            id,
            spot_transaction_id,
            asset_id,
            symbol,
            account_id,
            CAST(original_qty_num AS VARCHAR) AS original_qty,
            CAST(original_qty_num - matched_qty AS VARCHAR) AS remaining_qty,
            CASE
                WHEN raw_unit_cost_fiat < CAST(0 AS DECIMAL(38,18)) THEN 'NEGATIVE_COST_BASIS'
                WHEN currency_mismatch THEN 'CURRENCY_MISMATCH'
                WHEN raw_unit_cost_fiat IS NULL THEN 'MISSING_PRICE'
            END AS quality_flag,
            -- tax_lots.unit_cost_fiat is NOT NULL with a non-negative GLOB CHECK, so an unresolved
            -- or defective basis cannot be carried in the number itself. quality_flag is what
            -- distinguishes "genuinely free" from "we do not know" — reading the figure without it
            -- is the mistake this column exists to prevent.
            CASE WHEN quality_flag IS NULL THEN CAST(raw_unit_cost_fiat AS VARCHAR) ELSE '0' END AS unit_cost_fiat,
            CASE WHEN quality_flag IS NULL THEN CAST(raw_total_cost_fiat AS VARCHAR) ELSE '0' END AS total_cost_fiat,
            fiat_currency,
            acquisition_timestamp,
            exchange_location,
            source_tx_id,
            value_provenance,
            CASE
                WHEN original_qty_num - matched_qty <= CAST(0.0000000000000001 AS DECIMAL(38,18)) THEN 'CLOSED'
                WHEN matched_qty > CAST(0 AS DECIMAL(38,18)) THEN 'PARTIAL'
                ELSE 'OPEN'
            END AS status
        FROM lot_base;
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
            CASE WHEN m.quality_flag IS NULL AND m.taxable_disposal THEN 1 ELSE 0 END AS is_taxable,
            m.disposal_type,
            m.quality_flag,
            m.value_provenance,
            CAST(NULL AS VARCHAR) AS flag,
            CAST(NULL AS VARCHAR) AS notes,
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

  /**
   * Materialises the canonical FIFO event policy as a relation the views can join.
   *
   * One multi-row INSERT rather than one per row: a columnar engine pays the transaction and
   * vector-reorganisation cost per statement, not per tuple.
   *
   * `principal_disposal_type` is derived here rather than in SQL, which is what lets the views carry
   * no transaction-type literal at all. Both guards are load-bearing: the identifier check keeps the
   * generated statement free of anything but the vocabulary, and the membership check fails the
   * bootstrap loudly if a future type ever generates a principal disposal without belonging to
   * `DISPOSAL_TYPES` — otherwise the mismatch would surface much later, as a rejected write.
   */
  private async seedFifoEventPolicy(): Promise<void> {
    const disposalTypes: readonly string[] = DISPOSAL_TYPES;

    const values = fifoEventPolicyRows().map((row) => {
      if (!/^[A-Z_]+$/.test(row.txType)) {
        throw new Error(
          `[DuckDbAdapter] FIFO_EVENT_POLICY carries an unexpected tx_type: '${row.txType}'.`,
        );
      }
      if (row.generatesDisposal && !disposalTypes.includes(row.txType)) {
        throw new Error(
          `[DuckDbAdapter] '${row.txType}' generates a principal disposal but is not a member of DISPOSAL_TYPES.`,
        );
      }
      const principal = row.generatesDisposal ? `'${row.txType}'` : 'NULL';
      const custodyMovement = !row.generatesAcquisition && !row.generatesDisposal;
      return `('${row.txType}', ${row.generatesAcquisition}, ${row.generatesDisposal}, ${row.generatesFeeDisposal}, ${row.taxableDisposal}, ${principal}, ${custodyMovement})`;
    });

    await this.connection!.run(`
      CREATE OR REPLACE TABLE fifo_event_policy (
          tx_type                 VARCHAR PRIMARY KEY,
          generates_acquisition   BOOLEAN NOT NULL,
          generates_disposal      BOOLEAN NOT NULL,
          generates_fee_disposal  BOOLEAN NOT NULL,
          taxable_disposal        BOOLEAN NOT NULL,
          principal_disposal_type VARCHAR,
          custody_movement        BOOLEAN NOT NULL
      );
      INSERT INTO fifo_event_policy VALUES ${values.join(', ')};
    `);
  }

  /**
   * Materialises the canonical flag severities so no view invents a second ranking.
   *
   * `pending_review` is the one judgement made here rather than read from a constant: it says
   * whether the override surface can resolve the defect at all. Declaring it as a total
   * `Record<FifoQualityFlag, boolean>` makes a new flag a compile error instead of a row that
   * silently reports itself unactionable.
   */
  private async seedFifoFlagSeverity(): Promise<void> {
    const resolvableByUser: Record<FifoQualityFlag, boolean> = {
      MISSING_PRICE: true,
      CURRENCY_MISMATCH: true,
      NEGATIVE_COST_BASIS: true,
      CUSTODY_RESIDUAL: true,
      UNTRACKED_INFLOW: true,
      CUSTODY_IMBALANCE: false,
      ORPHAN_LOT: false,
      UNKNOWN_TX_TYPE: false,
    };
    const severities: readonly string[] = FLAG_SEVERITIES;

    const values = FIFO_QUALITY_FLAGS.map((flag) => {
      if (!/^[A-Z_]+$/.test(flag)) {
        throw new Error(
          `[DuckDbAdapter] FIFO_QUALITY_FLAGS carries an unexpected flag: '${flag}'.`,
        );
      }
      const severity = FLAG_SEVERITY[flag];
      if (!severities.includes(severity)) {
        throw new Error(
          `[DuckDbAdapter] '${flag}' maps to severity '${severity}', which is not a member of FLAG_SEVERITIES.`,
        );
      }
      return `('${flag}', '${severity}', ${resolvableByUser[flag]})`;
    });

    await this.connection!.run(`
      CREATE OR REPLACE TABLE fifo_flag_severity (
          quality_flag   VARCHAR PRIMARY KEY,
          severity       VARCHAR NOT NULL,
          pending_review BOOLEAN NOT NULL
      );
      INSERT INTO fifo_flag_severity VALUES ${values.join(', ')};
    `);
  }

  /**
   * Publishes the synthetic-account naming contract into SQL from the exported constant, so the
   * engine and the ingestion path cannot drift to two different names for the same counterparty.
   */
  private async createAccountNamingMacros(): Promise<void> {
    if (!/^[A-Za-z0-9_-]+$/.test(SYNTHETIC_ACCOUNT_PREFIX)) {
      throw new Error(
        `[DuckDbAdapter] SYNTHETIC_ACCOUNT_PREFIX '${SYNTHETIC_ACCOUNT_PREFIX}' is not safe to compose into SQL.`,
      );
    }

    await this.connection!.run(`
      CREATE OR REPLACE MACRO synthetic_account_name(asset_symbol) AS
          '${SYNTHETIC_ACCOUNT_PREFIX}' || UPPER(TRIM(asset_symbol));
      CREATE OR REPLACE MACRO is_synthetic_account_name(account_name) AS
          account_name LIKE '${SYNTHETIC_ACCOUNT_PREFIX}%';
    `);
  }

  /**
   * Creates the double-entry custody relations. Bound on first use rather than at bootstrap.
   *
   * DuckDB binds a view when it is created, and the cost of binding is proportional to the size of
   * the fully expanded reference tree. This chain is seven views deep and `v_fifo_data_quality`
   * alone expands to the whole of it, which measured 417 ms of the 793 ms `initialize()` spent —
   * paid by every caller, including the majority that never read a custody relation and whose test
   * budget it was consuming. Binding on demand moves that cost to the callers that ask for it.
   */
  private async createCustodyRelations(): Promise<void> {
    this.ensureConnection();
  // -----------------------------------------------------------------------
  //  Double-entry custody
  // -----------------------------------------------------------------------
  // Custody is a balance, not a pairing. Every leg of a movement resolves its own counterparty
  // and posts two entries that cancel, so nothing has to be matched to anything: a withdrawal
  // whose deposit never appears accumulates in the synthetic counterparty instead of failing,
  // self-custody spanning years costs nothing, and two movements of the same asset in
  // succession cannot cross-match because there is no match to make.
  //
  // The counterparty resolves in one order: a user-declared destination, then a counterparty
  // the ledger itself records through `transfer_group_id`, then the synthetic per-asset
  // account. Nothing is inferred from how close two rows are in time or in amount.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_custody_movements AS
    WITH fiat_assets AS MATERIALIZED (
        SELECT id FROM ledger.assets WHERE is_fiat = 1
    ),
    custody_tx AS MATERIALIZED (
        SELECT
            t.id, t.id_hash, t.account_id, t.timestamp, t.transfer_group_id,
            t.asset_in_id, t.amount_in, t.asset_out_id, t.amount_out
        FROM ledger.spot_transactions t
        JOIN fifo_event_policy p ON p.tx_type = t.tx_type
        WHERE p.custody_movement
          AND t.status = 'COMPLETED'
          AND t.deleted_at IS NULL
    ),
    legs AS (
        SELECT
            id AS spot_transaction_id, id_hash, account_id AS own_account_id,
            transfer_group_id, timestamp AS occurred_at, asset_out_id AS asset_id,
            TRY_CAST(amount_out AS DECIMAL(38,18)) AS qty, 'OUT' AS direction
        FROM custody_tx
        WHERE asset_out_id IS NOT NULL
          AND asset_out_id NOT IN (SELECT id FROM fiat_assets)

        UNION ALL

        SELECT
            id, id_hash, account_id,
            transfer_group_id, timestamp, asset_in_id,
            TRY_CAST(amount_in AS DECIMAL(38,18)), 'IN'
        FROM custody_tx
        WHERE asset_in_id IS NOT NULL
          AND asset_in_id NOT IN (SELECT id FROM fiat_assets)
    ),
    recorded_counterparty AS (
        -- An explicit link the ledger already carries, not an inference. A group naming more
        -- than one candidate account is ambiguous, and ambiguity falls through to the synthetic
        -- counterparty rather than being settled by picking the closest row.
        SELECT
            l.spot_transaction_id,
            l.direction,
            CASE WHEN COUNT(DISTINCT o.own_account_id) = 1
                 THEN MIN(o.own_account_id)
            END AS counterparty_account_id
        FROM legs l
        JOIN legs o
          ON o.transfer_group_id = l.transfer_group_id
         AND o.asset_id = l.asset_id
         AND o.direction <> l.direction
         AND o.own_account_id <> l.own_account_id
        WHERE l.transfer_group_id IS NOT NULL
        GROUP BY 1, 2
    )
    SELECT
        spot_transaction_id,
        id_hash,
        asset_id,
        occurred_at,
        direction,
        qty,
        CASE WHEN direction = 'OUT' THEN own_account_id ELSE counterparty END AS from_account_id,
        CASE WHEN direction = 'OUT' THEN counterparty ELSE own_account_id END AS to_account_id,
        own_account_id,
        counterparty AS counterparty_account_id,
        is_synthetic_account_name(counterparty) AS counterparty_is_synthetic
    FROM (
        SELECT
            l.*,
            COALESCE(
                ovr.counterparty_account_id,
                rc.counterparty_account_id,
                synthetic_account_name(l.asset_id)
            ) AS counterparty
        FROM legs l
        LEFT JOIN ledger.transfer_destination_overrides ovr
               ON ovr.id_hash = l.id_hash AND ovr.deleted_at IS NULL
        LEFT JOIN recorded_counterparty rc
               ON rc.spot_transaction_id = l.spot_transaction_id
              AND rc.direction = l.direction
    )
    WHERE qty IS NOT NULL AND qty > CAST(0 AS DECIMAL(38,18));
  `);

  // The event stream custody replays. Four kinds, and the rank is the physical order they can
  // occur in at one instant: a quantity must be acquired before it can move, must leave one
  // account before it arrives at another, and a network fee settles after the principal leg —
  // which is why an under-funded transfer leaves its shortfall on the fee rather than silently
  // shrinking the recorded movement.
  //
  // `step` is what the recursion advances through, and only movement legs get one of their own:
  // each has to see what the previous one left behind. Originations and consumptions are pure
  // additions to and subtractions from inventory, so they are folded into the step of the
  // movement they precede.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_lot_custody_timeline AS
    -- Every upstream relation is read exactly once. Without the MATERIALIZED pins each of the
    -- four branches below re-derives v_flattened_fifo_events through the attached SQLite ledger,
    -- and the binder pays that subtree once per reference at CREATE time as well.
    WITH acquisitions AS MATERIALIZED (
        SELECT tx_id, id_hash, asset_id, account_id, timestamp, amount FROM v_acquisitions
    ),
    movements AS MATERIALIZED (
        SELECT * FROM v_custody_movements
    ),
    matches AS MATERIALIZED (
        SELECT acquisition_tx_id, disposal_tx_id, asset_id, matched_amount, disposal_date
        FROM v_fifo_matches
        WHERE matched_amount > CAST(0 AS DECIMAL(38,18))
    ),
    lot_origination AS (
        SELECT
            md5(a.id_hash || '_' || a.asset_id) AS tax_lot_id,
            a.asset_id,
            a.account_id,
            a.tx_id AS spot_transaction_id,
            a.timestamp AS occurred_at,
            CAST(a.amount AS DECIMAL(38,18)) AS qty
        FROM acquisitions a
    ),
    disposal_accounts AS (
        SELECT tx_id, asset_id, MIN(account_id) AS account_id
        FROM v_disposals
        GROUP BY 1, 2
    ),
    lot_consumption AS (
        SELECT
            md5(a.id_hash || '_' || a.asset_id) AS tax_lot_id,
            m.asset_id,
            d.account_id,
            m.disposal_tx_id AS spot_transaction_id,
            MIN(m.disposal_date) AS occurred_at,
            CAST(SUM(m.matched_amount) AS DECIMAL(38,18)) AS qty
        FROM matches m
        JOIN acquisitions a
          ON a.tx_id = m.acquisition_tx_id AND a.asset_id = m.asset_id
        JOIN disposal_accounts d
          ON d.tx_id = m.disposal_tx_id AND d.asset_id = m.asset_id
        GROUP BY 1, 2, 3, 4
    ),
    events AS (
        SELECT
            0 AS event_rank, asset_id, occurred_at, spot_transaction_id, tax_lot_id,
            account_id, CAST(NULL AS VARCHAR) AS counterparty_account_id, qty,
            CAST(NULL AS VARCHAR) AS direction
        FROM lot_origination

        UNION ALL

        SELECT
            1, asset_id, occurred_at, spot_transaction_id, CAST(NULL AS VARCHAR),
            from_account_id, to_account_id, qty, direction
        FROM movements
        WHERE direction = 'OUT'

        UNION ALL

        SELECT
            2, asset_id, occurred_at, spot_transaction_id, CAST(NULL AS VARCHAR),
            from_account_id, to_account_id, qty, direction
        FROM movements
        WHERE direction = 'IN'

        UNION ALL

        SELECT
            3, asset_id, occurred_at, spot_transaction_id, tax_lot_id,
            account_id, CAST(NULL AS VARCHAR), qty, CAST(NULL AS VARCHAR)
        FROM lot_consumption
    ),
    ordered AS (
        SELECT
            e.*,
            COUNT(CASE WHEN e.event_rank IN (1, 2) THEN 1 END) OVER (
                PARTITION BY e.asset_id
                ORDER BY e.occurred_at, e.event_rank, e.spot_transaction_id
                ROWS UNBOUNDED PRECEDING
            ) AS movements_through,
            COUNT(CASE WHEN e.event_rank IN (1, 2) THEN 1 END) OVER (
                PARTITION BY e.asset_id
            ) AS movement_legs
        FROM events e
    )
    -- Only a movement leg gets a step of its own; everything else is folded into the step of
    -- the movement it precedes. Originations and consumptions only add to or subtract from
    -- inventory, and those are commutative, so batching them is order-preserving while it makes
    -- the recursion's depth the number of movement legs rather than the number of events.
    SELECT
        o.* EXCLUDE (movements_through, movement_legs),
        CASE WHEN o.event_rank IN (1, 2)
             THEN o.movements_through
             ELSE o.movements_through + 1
        END AS step,
        o.movement_legs AS movement_legs,
        o.movement_legs > 0 AS asset_has_movement
    FROM ordered o;
  `);

  // Custody allocation is the one genuinely sequential part of this engine: each movement draws
  // from what the movements before it left in that account, so the cumulative-interval join
  // that matches taxation FIFO cannot express it. The recursion carries the inventory as keyed
  // rows and `USING KEY` overwrites them in place, so state stays bounded by
  // (asset, account, lot) rather than growing one snapshot per step.
  //
  // This ordering is per (account, asset) and has no fiscal effect whatsoever: it decides which
  // lot's quantity moved, never which lot a sale consumes. Nothing here emits an event, changes
  // a remaining quantity or a status, or reorders the global per-asset taxation queue.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_lot_custody_allocation AS
    WITH RECURSIVE
    timeline AS MATERIALIZED (
        SELECT * FROM v_lot_custody_timeline
        WHERE asset_has_movement AND step <= movement_legs
    ),
    lot_meta AS (
        SELECT tax_lot_id, occurred_at AS acq_ts FROM timeline WHERE event_rank = 0
    ),
    state USING KEY (row_kind, asset_id, account_id, tax_lot_id, step) AS (
        SELECT
            'CURSOR' AS row_kind,
            asset_id,
            '' AS account_id,
            '' AS tax_lot_id,
            CAST(0 AS BIGINT) AS step,
            CAST(0 AS BIGINT) AS cur_step,
            CAST(0 AS DECIMAL(38,18)) AS qty,
            CAST(NULL AS VARCHAR) AS spot_transaction_id,
            CAST(NULL AS VARCHAR) AS occurred_at,
            CAST(NULL AS VARCHAR) AS counterparty_account_id,
            CAST(NULL AS VARCHAR) AS direction
        FROM (SELECT DISTINCT asset_id FROM timeline)

        UNION ALL

        SELECT * FROM (
            WITH nxt AS (
                SELECT t.*
                FROM timeline t
                JOIN (
                    SELECT asset_id, MAX(cur_step) + 1 AS step
                    FROM state
                    WHERE row_kind = 'CURSOR'
                    GROUP BY asset_id
                ) k ON k.asset_id = t.asset_id AND k.step = t.step
            ),
            prev_inv AS (
                SELECT asset_id, account_id, tax_lot_id, qty
                FROM recurring.state
                WHERE row_kind = 'INV'
            ),
            -- Every origination and consumption that falls before this step's movement, netted
            -- per lot so a lot acquired and partly sold between two movements costs one row.
            inv_delta AS (
                SELECT
                    asset_id,
                    account_id,
                    tax_lot_id,
                    CAST(SUM(CASE WHEN event_rank = 0 THEN qty ELSE -qty END) AS DECIMAL(38,18)) AS qty
                FROM nxt
                WHERE event_rank IN (0, 3)
                GROUP BY ALL
            ),
            inv AS (
                SELECT
                    asset_id,
                    account_id,
                    tax_lot_id,
                    CAST(SUM(qty) AS DECIMAL(38,18)) AS qty
                FROM (
                    SELECT asset_id, account_id, tax_lot_id, qty FROM prev_inv
                    UNION ALL
                    SELECT asset_id, account_id, tax_lot_id, qty FROM inv_delta
                )
                GROUP BY ALL
            ),
            movement AS (
                SELECT * FROM nxt WHERE event_rank IN (1, 2)
            ),
            available AS (
                SELECT
                    i.asset_id,
                    i.account_id,
                    i.tax_lot_id,
                    GREATEST(i.qty, CAST(0 AS DECIMAL(38,18))) AS av,
                    SUM(GREATEST(i.qty, CAST(0 AS DECIMAL(38,18)))) OVER (
                        PARTITION BY i.asset_id, i.account_id
                        ORDER BY lm.acq_ts, i.tax_lot_id
                    ) AS cum
                FROM inv i
                JOIN lot_meta lm ON lm.tax_lot_id = i.tax_lot_id
            ),
            allocation AS (
                SELECT * FROM (
                    SELECT
                        m.spot_transaction_id,
                        m.asset_id,
                        m.account_id AS from_account_id,
                        m.counterparty_account_id AS to_account_id,
                        m.occurred_at,
                        m.direction,
                        m.step,
                        av.tax_lot_id,
                        LEAST(
                            av.av,
                            GREATEST(CAST(0 AS DECIMAL(38,18)), m.qty - (av.cum - av.av))
                        ) AS alloc_qty
                    FROM movement m
                    JOIN available av
                      ON av.asset_id = m.asset_id AND av.account_id = m.account_id
                ) WHERE alloc_qty > CAST(0 AS DECIMAL(38,18))
            ),
            -- One net change per inventory key per step. Emitting the ledger events and the
            -- allocation legs separately would write the same key twice in a single iteration,
            -- and USING KEY keeps only one of them — which happens exactly when a lot is
            -- acquired and moved out of the same account between two movements.
            inv_change AS (
                SELECT
                    asset_id,
                    account_id,
                    tax_lot_id,
                    CAST(SUM(qty) AS DECIMAL(38,18)) AS qty
                FROM (
                    SELECT asset_id, account_id, tax_lot_id, qty FROM inv_delta
                    UNION ALL
                    SELECT asset_id, from_account_id, tax_lot_id, -alloc_qty FROM allocation
                    UNION ALL
                    SELECT asset_id, to_account_id, tax_lot_id, alloc_qty FROM allocation
                )
                GROUP BY ALL
            )

            -- The cursor is re-emitted every step so the recursion cannot terminate merely
            -- because a step changed nothing.
            SELECT DISTINCT
                'CURSOR', asset_id, '', '', CAST(0 AS BIGINT), step,
                CAST(0 AS DECIMAL(38,18)), NULL, NULL, NULL, NULL
            FROM nxt

            UNION ALL

            SELECT
                'INV', c.asset_id, c.account_id, c.tax_lot_id, CAST(0 AS BIGINT), CAST(0 AS BIGINT),
                CAST(COALESCE(p.qty, CAST(0 AS DECIMAL(38,18))) + c.qty AS DECIMAL(38,18)),
                NULL, NULL, NULL, NULL
            FROM inv_change c
            LEFT JOIN prev_inv p
                   ON p.asset_id = c.asset_id
                  AND p.account_id = c.account_id
                  AND p.tax_lot_id = c.tax_lot_id

            UNION ALL

            SELECT
                'ALLOC', a.asset_id, a.from_account_id, a.tax_lot_id, a.step, a.step,
                CAST(a.alloc_qty AS DECIMAL(38,18)),
                a.spot_transaction_id, a.occurred_at, a.to_account_id, a.direction
            FROM allocation a
        )
    )
    SELECT
        spot_transaction_id,
        asset_id,
        tax_lot_id,
        qty,
        account_id AS from_account_id,
        counterparty_account_id AS to_account_id,
        occurred_at,
        direction,
        step AS allocation_step
    FROM state
    WHERE row_kind = 'ALLOC';
  `);

  // One debit and one credit per allocated slice. The two legs are the same magnitude with
  // opposite signs, so a movement nets to zero for its asset by construction — the property
  // that makes custody idempotent and order-independent across rebuilds.
  //
  // Emitted at 12 decimal places because `lot_custody_entries.qty_delta` is TEXT behind a GLOB
  // that admits no exponent form.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_custody_entries AS
    WITH allocated AS MATERIALIZED (
        SELECT * FROM v_lot_custody_allocation
    )
    SELECT
        md5(a.spot_transaction_id || '_' || a.direction || '_' || a.tax_lot_id || '_' || a.from_account_id) AS id,
        a.tax_lot_id,
        a.asset_id,
        a.from_account_id AS account_id,
        PRINTF('%.12f', -CAST(a.qty AS DOUBLE)) AS qty_delta,
        a.occurred_at,
        a.spot_transaction_id
    FROM allocated a

    UNION ALL

    SELECT
        md5(a.spot_transaction_id || '_' || a.direction || '_' || a.tax_lot_id || '_' || a.to_account_id) AS id,
        a.tax_lot_id,
        a.asset_id,
        a.to_account_id AS account_id,
        PRINTF('%.12f', CAST(a.qty AS DOUBLE)) AS qty_delta,
        a.occurred_at,
        a.spot_transaction_id
    FROM allocated a;
  `);

  // Where each lot's quantity physically sits now: credited at its acquiring account, debited
  // where it was disposed of, and shifted by every allocated movement. The lot row itself is
  // untouched — `tax_lots.exchange_location` keeps reporting the acquiring venue no matter how
  // many times the quantity has moved.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_lot_current_location AS
    WITH allocated AS MATERIALIZED (
        SELECT tax_lot_id, asset_id, from_account_id, to_account_id, qty
        FROM v_lot_custody_allocation
    ),
    lot_flows AS MATERIALIZED (
        SELECT tax_lot_id, asset_id, account_id, event_rank, qty
        FROM v_lot_custody_timeline
        WHERE event_rank IN (0, 3)
    ),
    deltas AS (
        SELECT
            tax_lot_id, asset_id, account_id,
            CASE WHEN event_rank = 0 THEN qty ELSE -qty END AS qty_delta
        FROM lot_flows

        UNION ALL

        SELECT tax_lot_id, asset_id, to_account_id, qty FROM allocated

        UNION ALL

        SELECT tax_lot_id, asset_id, from_account_id, -qty FROM allocated
    )
    SELECT
        d.tax_lot_id,
        d.asset_id,
        d.account_id,
        COALESCE(acc.name, d.account_id) AS account_name,
        COALESCE(
            acc.is_synthetic,
            CASE WHEN is_synthetic_account_name(d.account_id) THEN 1 ELSE 0 END
        ) AS is_synthetic,
        acc.parent_account_id,
        CAST(SUM(d.qty_delta) AS DECIMAL(38,18)) AS qty
    FROM deltas d
    LEFT JOIN ledger.accounts acc ON acc.id = d.account_id
    GROUP BY ALL;
  `);

  // Two figures per account and asset that ought to agree: what the ledger says the account
  // holds, and what custody can attribute to actual lots. They diverge exactly when a movement
  // could not be backed by any lot held there, or when a disposal exceeded everything ever
  // acquired — which is what makes the difference worth reporting rather than absorbing.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_custody_balances AS
    WITH movements AS MATERIALIZED (
        SELECT asset_id, from_account_id, to_account_id, qty FROM v_custody_movements
    ),
    ledger_flows AS (
        SELECT asset_id, account_id, CAST(amount AS DECIMAL(38,18)) AS qty_delta
        FROM v_acquisitions

        UNION ALL

        SELECT asset_id, account_id, -CAST(amount AS DECIMAL(38,18))
        FROM v_disposals

        UNION ALL

        SELECT asset_id, from_account_id, -qty FROM movements

        UNION ALL

        SELECT asset_id, to_account_id, qty FROM movements
    ),
    ledger_balances AS (
        SELECT asset_id, account_id, CAST(SUM(qty_delta) AS DECIMAL(38,18)) AS balance
        FROM ledger_flows
        GROUP BY ALL
    ),
    custody_totals AS (
        SELECT asset_id, account_id, CAST(SUM(qty) AS DECIMAL(38,18)) AS custody_qty
        FROM v_lot_current_location
        GROUP BY ALL
    )
    SELECT
        COALESCE(lb.account_id, ct.account_id) AS account_id,
        COALESCE(lb.asset_id, ct.asset_id) AS asset_id,
        COALESCE(acc.name, COALESCE(lb.account_id, ct.account_id)) AS account_name,
        COALESCE(
            acc.is_synthetic,
            CASE WHEN is_synthetic_account_name(COALESCE(lb.account_id, ct.account_id)) THEN 1 ELSE 0 END
        ) AS is_synthetic,
        acc.parent_account_id,
        COALESCE(lb.balance, CAST(0 AS DECIMAL(38,18))) AS balance,
        COALESCE(ct.custody_qty, CAST(0 AS DECIMAL(38,18))) AS custody_qty,
        CAST(
            COALESCE(lb.balance, CAST(0 AS DECIMAL(38,18)))
            - COALESCE(ct.custody_qty, CAST(0 AS DECIMAL(38,18)))
        AS DECIMAL(38,18)) AS custody_gap
    FROM ledger_balances lb
    FULL OUTER JOIN custody_totals ct
      ON ct.account_id = lb.account_id AND ct.asset_id = lb.asset_id
    LEFT JOIN ledger.accounts acc ON acc.id = COALESCE(lb.account_id, ct.account_id);
  `);

  // Defects are data. Nothing here blocks a rebuild, and severity is read from the seeded
  // vocabulary rather than restated, so there is exactly one ranking in the system.
  //
  // The residual tolerance is the asset's own recorded fee volume: an unrecorded network fee
  // cannot plausibly exceed the fees that were recorded for that same asset. A shared absolute
  // constant would be meaningless across assets whose unit values differ by orders of
  // magnitude — 0,01 is noise in XRP and a fortune in BTC.
  //
  // Sign is the whole diagnosis. A positive synthetic balance means the quantity left known
  // accounts and has not come back, which may be entirely correct. A negative balance means
  // more was moved or disposed of than ever arrived, so a holding exists whose cost basis was
  // never established — the fiscally dangerous direction, and the reason this is high severity
  // wherever it occurs rather than only on the synthetic account.
  await this.connection!.run(`
    CREATE OR REPLACE VIEW v_fifo_data_quality AS
    WITH fee_scale AS (
        SELECT
            t.fee_asset_id AS asset_id,
            CAST(SUM(TRY_CAST(t.fee_amount AS DECIMAL(38,18))) AS DECIMAL(38,18)) AS recorded_fees
        FROM ledger.spot_transactions t
        WHERE t.fee_asset_id IS NOT NULL
          AND t.status = 'COMPLETED'
          AND t.deleted_at IS NULL
        GROUP BY 1
    ),
    balances AS MATERIALIZED (
        SELECT asset_id, account_id, is_synthetic, balance, custody_gap FROM v_custody_balances
    ),
    balances_scaled AS (
        SELECT
            b.*,
            GREATEST(
                COALESCE(fs.recorded_fees, CAST(0 AS DECIMAL(38,18))),
                CAST(0.000000000001 AS DECIMAL(38,18))
            ) AS tolerance
        FROM balances b
        LEFT JOIN fee_scale fs ON fs.asset_id = b.asset_id
    ),
    disposal_accounts AS (
        SELECT tx_id, asset_id, MIN(account_id) AS account_id
        FROM v_disposals
        GROUP BY 1, 2
    ),
    defects AS (
        SELECT
            l.quality_flag, l.asset_id, l.account_id,
            l.spot_transaction_id AS tx_id, l.acquisition_timestamp AS occurred_at
        FROM v_calculated_tax_lots l
        WHERE l.quality_flag IS NOT NULL

        UNION ALL

        SELECT
            m.quality_flag, m.asset_id, d.account_id,
            m.disposal_tx_id AS tx_id, m.disposal_date AS occurred_at
        FROM v_fifo_matches m
        LEFT JOIN disposal_accounts d
               ON d.tx_id = m.disposal_tx_id AND d.asset_id = m.asset_id
        WHERE m.quality_flag IS NOT NULL
          AND m.matched_amount > CAST(0 AS DECIMAL(38,18))

        UNION ALL

        SELECT
            'CUSTODY_RESIDUAL', b.asset_id, b.account_id,
            CAST(NULL AS VARCHAR), CAST(NULL AS VARCHAR)
        FROM balances_scaled b
        WHERE b.is_synthetic = 1
          AND b.balance > b.tolerance

        UNION ALL

        SELECT
            'UNTRACKED_INFLOW', b.asset_id, b.account_id,
            CAST(NULL AS VARCHAR), CAST(NULL AS VARCHAR)
        FROM balances_scaled b
        WHERE b.balance < -b.tolerance

        UNION ALL

        -- A precision tolerance, not a matching band: custody entries are persisted at twelve
        -- decimal places, so a divergence below that is not representable in the stored figures.
        SELECT
            'CUSTODY_IMBALANCE', b.asset_id, b.account_id,
            CAST(NULL AS VARCHAR), CAST(NULL AS VARCHAR)
        FROM balances b
        WHERE b.custody_gap > CAST(0.000000000001 AS DECIMAL(38,18))
           OR b.custody_gap < CAST(-0.000000000001 AS DECIMAL(38,18))
    )
    SELECT
        d.quality_flag,
        s.severity,
        d.asset_id,
        d.account_id,
        d.tx_id,
        d.occurred_at,
        'fifo_quality.' || LOWER(d.quality_flag) AS detail_key,
        s.pending_review
    FROM defects d
    JOIN fifo_flag_severity s ON s.quality_flag = d.quality_flag;
  `);
  }

  /**
   * Binds the custody chain the first time a statement mentions any part of it, once per connection.
   *
   * `duckdb_views()` counts as a mention: a caller inspecting the catalogue expects to find the
   * whole of it, and a hygiene assertion that silently stopped covering these definitions would be
   * worse than the bootstrap cost it saves.
   */
  private async ensureCustodyRelations(sql: string): Promise<void> {
    if (!DuckDbAdapter.CUSTODY_RELATION_MENTION.test(sql)) return;
    if (!this.custodyRelations) {
      this.custodyRelations = this.createCustodyRelations();
    }
    await this.custodyRelations;
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.ensureConnection();
    await this.ensureCustodyRelations(sql);
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(toDuckDbParams(params, 'DuckDbAdapter.execute'));
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
    await this.ensureCustodyRelations(sql);
    const stmt = await this.connection!.prepare(sql);
    if (params.length > 0) {
      stmt.bind(toDuckDbParams(params, 'DuckDbAdapter.queryMany'));
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
            appender.appendValue(toDuckDbValue(val, 'DuckDbAdapter.bulkInsert', colName));
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
