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

      // Attach the SQLite ledger database
      await this.connection.run(
        `ATTACH '${resolvedLedgerPath}' AS ledger (TYPE SQLITE);`,
      );

      // Initialize asset_prices table for fee price resolution
      await this.connection.run(`
        CREATE TABLE IF NOT EXISTS asset_prices (
            symbol VARCHAR NOT NULL,
            price_fiat DECIMAL(38,18) NOT NULL,
            timestamp TIMESTAMP NOT NULL
        );
      `);

      // Initialize live_prices table for real-time unrealized PnL
      await this.connection.run(`
        CREATE TABLE IF NOT EXISTS live_prices (
            symbol VARCHAR PRIMARY KEY,
            price DECIMAL(38,18) NOT NULL
        );
      `);

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
            strftime(CAST(timestamp AS TIMESTAMP), '%Y') AS year
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
            strftime(CAST(timestamp AS TIMESTAMP), '%Y') AS year
        FROM ledger.spot_transactions
        WHERE tx_type IN ('AIRDROP', 'MINING')
          AND status = 'COMPLETED'
          AND deleted_at IS NULL;
      `);

      // Futures Realized PnL Aggregator View
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_futures_realized_pnl AS
        SELECT
            id,
            account_id,
            symbol,
            CAST(CAST(realized_pnl AS DOUBLE) * CAST(COALESCE(
                CASE
                    WHEN settlement_asset_id = 'EUR' THEN CAST(1 AS DECIMAL(38,18))
                    ELSE (
                        SELECT p.price_fiat
                        FROM asset_prices p
                        WHERE p.symbol = settlement_asset_id
                          AND p.timestamp <= CAST(timestamp AS TIMESTAMP)
                        ORDER BY p.timestamp DESC
                        LIMIT 1
                    )
                END,
                CAST(1 AS DECIMAL(38,18))
            ) AS DOUBLE) AS DECIMAL(38,18)) AS pnl_fiat,
            CAST(CAST(COALESCE(fee_amount, '0') AS DOUBLE) * CAST(COALESCE(
                CASE
                    WHEN fee_asset_id = 'EUR' THEN CAST(1 AS DECIMAL(38,18))
                    ELSE (
                        SELECT p.price_fiat
                        FROM asset_prices p
                        WHERE p.symbol = fee_asset_id
                          AND p.timestamp <= CAST(timestamp AS TIMESTAMP)
                        ORDER BY p.timestamp DESC
                        LIMIT 1
                    )
                END,
                CAST(1 AS DECIMAL(38,18))
            ) AS DOUBLE) AS DECIMAL(38,18)) AS fee_fiat,
            timestamp,
            strftime(CAST(timestamp AS TIMESTAMP), '%Y') AS year
        FROM ledger.futures_transactions
        WHERE status = 'COMPLETED'
          AND realized_pnl IS NOT NULL
          AND deleted_at IS NULL;
      `);

      // Create v_flattened_fifo_events view splitting swaps and handling fees
      await this.connection.run(`
        CREATE OR REPLACE VIEW v_flattened_fifo_events AS
        -- Acquisitions
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
                    WHEN tx.fee_asset_id = 'EUR' THEN CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE)) AS DECIMAL(38,18))
                    WHEN tx.fee_asset_id IS NOT NULL THEN
                        CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE) * CAST(COALESCE(
                            (
                                SELECT p.price_fiat
                                FROM asset_prices p
                                WHERE p.symbol = tx.fee_asset_id
                                  AND p.timestamp <= CAST(tx.timestamp AS TIMESTAMP)
                                ORDER BY p.timestamp DESC
                                LIMIT 1
                            ),
                            0.0
                        ) AS DOUBLE)) AS DECIMAL(38,18))
                    ELSE CAST(0 AS DECIMAL(38,18))
                END,
                CAST(0 AS DECIMAL(38,18))
            ) AS total_fiat,
            CAST(PRINTF('%.12f', CAST(tx.price_fiat AS DOUBLE)) AS DECIMAL(38,18)) AS price_fiat
        FROM ledger.spot_transactions tx
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

        -- Disposals (Crypto Fees)
        SELECT
            tx.id AS tx_id,
            tx.id_hash,
            tx.account_id,
            tx.timestamp,
            tx.fee_asset_id AS asset_id,
            'DISPOSAL' AS event_type,
            CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE)) AS DECIMAL(38,18)) AS amount,
            CAST(PRINTF('%.12f', CAST(tx.fee_amount AS DOUBLE) * CAST(COALESCE(
                (
                    SELECT p.price_fiat
                    FROM asset_prices p
                    WHERE p.symbol = tx.fee_asset_id
                      AND p.timestamp <= CAST(tx.timestamp AS TIMESTAMP)
                    ORDER BY p.timestamp DESC
                    LIMIT 1
                ),
                1.0
            ) AS DOUBLE)) AS DECIMAL(38,18)) AS total_fiat,
            CAST(PRINTF('%.12f', CAST(COALESCE(
                (
                    SELECT p.price_fiat
                    FROM asset_prices p
                    WHERE p.symbol = tx.fee_asset_id
                      AND p.timestamp <= CAST(tx.timestamp AS TIMESTAMP)
                    ORDER BY p.timestamp DESC
                    LIMIT 1
                ),
                1.0
            ) AS DOUBLE)) AS DECIMAL(38,18)) AS price_fiat
        FROM ledger.spot_transactions tx
        WHERE tx.fee_asset_id IS NOT NULL
          AND tx.fee_asset_id != 'EUR'
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
            a.account_id,
            CAST(a.amount AS VARCHAR) AS original_qty,
            CAST(a.amount - COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) AS VARCHAR) AS remaining_qty,
            CAST(a.unit_cost_fiat AS VARCHAR) AS unit_cost_fiat,
            CAST(a.total_fiat AS VARCHAR) AS total_cost_fiat,
            'EUR' AS fiat_currency,
            a.timestamp AS acquisition_timestamp,
            COALESCE(acc.name, 'Unknown') AS exchange_location,
            a.id_hash AS source_tx_id,
            CASE
                WHEN a.amount - COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) <= CAST(0.0000000000000001 AS DECIMAL(38,18)) THEN 'CLOSED'
                WHEN COALESCE(m.total_matched, CAST(0 AS DECIMAL(38,18))) > CAST(0 AS DECIMAL(38,18)) THEN 'PARTIAL'
                ELSE 'OPEN'
            END AS status
        FROM v_acquisitions a
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
            'EUR' AS fiat_currency,
            1 AS is_taxable,
            NULL AS flag,
            NULL AS notes,
            m.disposal_date
        FROM v_fifo_matches m
        JOIN v_acquisitions a ON m.acquisition_tx_id = a.tx_id AND m.asset_id = a.asset_id;
      `);

      // -----------------------------------------------------------------------
      // Parquet Federation — historical_prices view
      // -----------------------------------------------------------------------
      // Resolve the Parquet storage directory relative to the process CWD or an
      // explicit env override so both dev (monorepo root) and prod work correctly.
      const parquetBase =
        process.env.PARQUET_DATA_PATH ||
        path.resolve(process.cwd(), 'data/historical/prices');

      const sentinelDir = path.join(parquetBase, 'year=1970');
      const sentinelFile = path.join(sentinelDir, 'prices.parquet');

      // Ensure the base directory exists
      if (!fs.existsSync(parquetBase)) {
        fs.mkdirSync(parquetBase, { recursive: true });
      }

      // Create a schema-only sentinel file if no Parquet files exist yet.
      // This prevents DuckDB from throwing "No files found" on a fresh install.
      const hasParquetFiles = fs.existsSync(parquetBase) &&
        fs.readdirSync(parquetBase).some((entry) => {
          const entryPath = path.join(parquetBase, entry);
          if (!fs.statSync(entryPath).isDirectory()) return false;
          return fs.readdirSync(entryPath).some((f) => f.endsWith('.parquet'));
        });

      if (!hasParquetFiles) {
        fs.mkdirSync(sentinelDir, { recursive: true });
        // Use DuckDB COPY to write a schema-only Parquet file (zero rows)
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
          ) TO '${sentinelFile}' (FORMAT PARQUET);
        `);
      }

      // Mount the Parquet files as a federated view
      await this.connection.run(`
        CREATE OR REPLACE VIEW historical_prices AS
        SELECT *
        FROM read_parquet('${parquetBase}/*/*.parquet', hive_partitioning = true);
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
