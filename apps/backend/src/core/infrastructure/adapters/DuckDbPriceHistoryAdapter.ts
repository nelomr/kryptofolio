import type { AssetPrice } from '@kryptofolio/shared-types';
import type { IDatabasePort } from '@kryptofolio/database';
import type { IPriceHistoryPort } from '../../domain/ports/IPriceHistoryPort.js';

/**
 * DuckDbPriceHistoryAdapter — Infrastructure Adapter (DuckDB skeleton).
 *
 * Phase 0 skeleton: wires up the IDatabasePort from @kryptofolio/database and
 * creates the `asset_prices` table schema. Full analytical queries (window
 * functions, QUALIFY, GROUP BY ALL) are planned for Phase 1.
 *
 * DuckDB best practices (from duckdb-best-practices skill):
 *  - Bulk inserts must use the Appender API (not row-by-row INSERT INTO).
 *    Phase 1 will replace the `save()` method with an Appender-based flush.
 *  - Historical queries will use Window Functions (LAG, running totals) computed
 *    entirely in SQL — NOT in the application layer.
 *
 * @see .agent/skills/duckdb-best-practices/SKILL.md
 */
export class DuckDbPriceHistoryAdapter implements IPriceHistoryPort {
  private readonly db: IDatabasePort;

  constructor(db: IDatabasePort) {
    this.db = db;
  }



  // ---------------------------------------------------------------------------
  // IPriceHistoryPort
  // ---------------------------------------------------------------------------

  /**
   * Phase 0 skeleton — single row INSERT.
   *
   * TODO (Phase 1): Replace with DuckDB Appender API for bulk ingestion.
   * The Appender batches rows into columnar vectors before flushing,
   * dramatically reducing write overhead vs individual INSERTs.
   *
   * @example Phase 1 pattern (pseudo-code):
   *   const appender = await connection.createAppender('main', 'asset_prices');
   *   for (const price of priceBatch) {
   *     appender.appendVarchar(price.symbol);
   *     appender.appendDouble(price.price);
   *     appender.endRow();
   *   }
   *   appender.closeSync();
   */
  async save(price: AssetPrice): Promise<void> {

    await this.db.execute(
      `INSERT OR IGNORE INTO asset_prices
         (symbol, currency, price, change_24h, provider, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        price.symbol,
        price.currency,
        price.price,
        price.change24hPercent,
        price.provider,
        price.timestamp,
      ],
    );
  }

  /**
   * Phase 0 skeleton — retrieves the latest row using QUALIFY (DuckDB).
   *
   * DuckDB's QUALIFY clause filters Window Function results without a subquery —
   * much cleaner than wrapping in a CTE.
   */
  async getLatest(symbol: string, currency: string): Promise<AssetPrice | null> {

    const row = await this.db.queryOne<{
      symbol: string;
      currency: string;
      price: number;
      change_24h: number;
      provider: string;
      captured_at: string;
    }>(
      `SELECT symbol, currency, price, change_24h, provider, captured_at
       FROM asset_prices
       WHERE symbol = ? AND currency = ?
       QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol, currency ORDER BY captured_at DESC) = 1`,
      [symbol.toUpperCase(), currency.toUpperCase()],
    );

    if (!row) return null;

    return {
      symbol: row.symbol,
      currency: row.currency,
      price: row.price,
      change24hPercent: row.change_24h,
      provider: row.provider,
      timestamp: row.captured_at,
    };
  }

  async getHistory(
    symbol: string,
    currency: string,
    from: string,
    to?: string,
  ): Promise<AssetPrice[]> {

    const rows = await this.db.queryMany<{
      symbol: string;
      currency: string;
      price: number;
      change_24h: number;
      provider: string;
      captured_at: string;
    }>(
      `SELECT symbol, currency, price, change_24h, provider, captured_at
       FROM asset_prices
       WHERE symbol = ?
         AND currency = ?
         AND captured_at >= ?
         AND captured_at <= ?
       ORDER BY captured_at ASC`,
      [
        symbol.toUpperCase(),
        currency.toUpperCase(),
        from,
        to ?? new Date().toISOString(),
      ],
    );

    return rows.map((r) => ({
      symbol: r.symbol,
      currency: r.currency,
      price: r.price,
      change24hPercent: r.change_24h,
      provider: r.provider,
      timestamp: r.captured_at,
    }));
  }

  async getTrackedSymbols(): Promise<string[]> {

    const rows = await this.db.queryMany<{ symbol: string }>(
      `SELECT DISTINCT symbol FROM asset_prices ORDER BY symbol`,
    );
    return rows.map((r) => r.symbol);
  }
}
