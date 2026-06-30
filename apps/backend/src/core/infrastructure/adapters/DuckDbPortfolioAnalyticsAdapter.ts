import type { IAnalyticalDatabasePort } from "@kryptofolio/database";
import type {
  IPortfolioAnalyticsPort,
  HoldingsSnapshot,
  DerivativesPnl,
} from "../../domain/ports/IPortfolioAnalyticsPort.js";

export class DuckDbPortfolioAnalyticsAdapter implements IPortfolioAnalyticsPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  public async getHoldingsSnapshot(
    accountId?: string,
    livePrices?: Array<{ symbol: string; price: string }>
  ): Promise<HoldingsSnapshot[]> {
    // 1. Populate live prices if provided
    if (livePrices && livePrices.length > 0) {
      await this.db.execute("DELETE FROM live_prices WHERE 1=1;");
      const mappedPrices = livePrices.map(lp => ({
        symbol: lp.symbol,
        price: lp.price
      }));
      await this.db.bulkInsert("live_prices", mappedPrices);
    }

    // 2. Query snapshots joining with live_prices if available
    let sql = `
      WITH holdings AS (
          SELECT
              a.id AS asset_id,
              a.symbol,
              SUM(CAST(l.remaining_qty AS DECIMAL(38,18))) AS total_qty,
              SUM(CAST(CAST(l.remaining_qty AS DOUBLE) * CAST(l.unit_cost_fiat AS DOUBLE) AS DECIMAL(38,18))) AS total_cost_fiat
          FROM ledger.assets a
          JOIN ledger.tax_lots l ON a.id = l.asset_id
          WHERE l.status IN ('OPEN', 'PARTIAL')
    `;

    if (accountId) {
      sql += ` AND l.account_id = '${accountId}'`;
    }

    sql += `
          GROUP BY a.id, a.symbol
      )
      SELECT
          h.asset_id,
          h.symbol,
          CAST(h.total_qty AS VARCHAR) AS total_qty,
          CAST(CAST(PRINTF('%.12f', CAST(h.total_cost_fiat AS DOUBLE) / CAST(h.total_qty AS DOUBLE)) AS DECIMAL(38,18)) AS VARCHAR) AS avg_unit_cost,
          CAST(h.total_cost_fiat AS VARCHAR) AS total_cost_fiat,
          CAST(lp.price AS VARCHAR) AS live_price,
          CAST(CAST(CAST(h.total_qty AS DOUBLE) * CAST(lp.price AS DOUBLE) AS DECIMAL(38,18)) AS VARCHAR) AS current_value_fiat,
          CAST(CAST(CAST(h.total_qty AS DOUBLE) * CAST(lp.price AS DOUBLE) - CAST(h.total_cost_fiat AS DOUBLE) AS DECIMAL(38,18)) AS VARCHAR) AS unrealized_pnl_fiat
      FROM holdings h
      LEFT JOIN live_prices lp ON h.symbol = lp.symbol
    `;

    const results = await this.db.queryMany<any>(sql);
    return results.map(r => ({
      assetId: r.asset_id,
      symbol: r.symbol,
      totalQty: r.total_qty,
      avgUnitCost: r.avg_unit_cost,
      totalCostFiat: r.total_cost_fiat,
      livePrice: r.live_price ?? undefined,
      currentValueFiat: r.current_value_fiat ?? undefined,
      unrealizedPnlFiat: r.unrealized_pnl_fiat ?? undefined,
    }));
  }

  public async getDerivativesPnl(accountId?: string): Promise<DerivativesPnl[]> {
    let sql = `
      SELECT
          symbol,
          symbol AS contractName,
          CAST(COALESCE(SUM(CAST(realized_pnl AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS realizedPnl,
          CAST(COALESCE(SUM(CAST(funding_amount AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS funding,
          CAST(COALESCE(SUM(CAST(fee_amount AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS fees,
          CAST(COALESCE(SUM(CAST(realized_pnl AS DECIMAL(38,18)) + COALESCE(CAST(funding_amount AS DECIMAL(38,18)), 0.0) - COALESCE(CAST(fee_amount AS DECIMAL(38,18)), 0.0)), 0.0) AS VARCHAR) AS netPnl
      FROM ledger.futures_transactions
      WHERE status = 'COMPLETED'
        AND deleted_at IS NULL
    `;

    if (accountId) {
      sql += ` AND account_id = '${accountId}'`;
    }

    sql += " GROUP BY symbol";

    const results = await this.db.queryMany<any>(sql);
    return results.map(r => ({
      symbol: r.symbol,
      contractName: r.contractName,
      realizedPnl: r.realizedPnl,
      funding: r.funding,
      fees: r.fees,
      netPnl: r.netPnl,
    }));
  }
}
