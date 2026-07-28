import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
  IPortfolioAnalyticsPort,
  HoldingsSnapshot,
  DerivativesPnl,
} from '../../domain/ports/IPortfolioAnalyticsPort.js';

interface RawHoldingsRow {
  asset_id: string;
  symbol: string;
  total_qty: string;
  avg_unit_cost: string;
  total_cost_fiat: string;
  currency: string;
  portfolio_locations?: unknown;
  live_price: string | null;
  current_value_fiat: string | null;
  unrealized_pnl_fiat: string | null;
}

interface RawDerivativesPnlRow {
  symbol: string;
  contractName: string;
  realizedPnl: string;
  funding: string;
  fees: string;
  netPnl: string;
  currency: string;
}

function parseStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return val ? [val] : [];
    }
  }
  return [];
}

export class DuckDbPortfolioAnalyticsAdapter implements IPortfolioAnalyticsPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  public async getHoldingsSnapshot(
    accountId?: string,
    targetCurrency = 'USD',
  ): Promise<HoldingsSnapshot[]> {
    const params: unknown[] = [targetCurrency];
    let whereClause = '';

    if (accountId) {
      params.push(accountId);
      whereClause = `AND l.account_id = $${params.length}`;
    }

    const sql = `
      WITH holdings AS (
          SELECT
              a.id AS asset_id,
              a.symbol,
              SUM(CAST(l.remaining_qty AS DECIMAL(38,18))) AS total_qty,
              SUM(CAST(CAST(l.remaining_qty AS DOUBLE) * CAST(l.unit_cost_fiat AS DOUBLE) AS DECIMAL(38,18))) AS total_cost_fiat,
              $1 AS currency,
              TO_JSON(ARRAY_AGG(DISTINCT COALESCE(acc.name, l.exchange_location, 'Unknown'))) AS portfolio_locations
          FROM ledger.assets a
          JOIN (
              SELECT asset_id, account_id, exchange_location, remaining_qty, unit_cost_fiat, fiat_currency, status
              FROM v_calculated_tax_lots
              UNION ALL
              SELECT asset_id, account_id, exchange_location, remaining_qty, unit_cost_fiat, fiat_currency, status
              FROM ledger.tax_lots
              WHERE spot_transaction_id IS NULL OR spot_transaction_id NOT IN (SELECT tx_id FROM v_flattened_fifo_events)
          ) l ON (a.id = l.asset_id OR a.symbol = l.asset_id)
          LEFT JOIN ledger.accounts acc ON l.account_id = acc.id
          WHERE l.status IN ('OPEN', 'PARTIAL')
          ${whereClause}
          GROUP BY a.id, a.symbol
      ),
      latest_prices AS (
          SELECT symbol, close
          FROM historical_prices
          QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) = 1
      )
      SELECT
          h.asset_id,
          h.symbol,
          CAST(h.total_qty AS VARCHAR) AS total_qty,
          CAST(CAST(PRINTF('%.12f', CAST(h.total_cost_fiat AS DOUBLE) / CAST(h.total_qty AS DOUBLE)) AS DECIMAL(38,18)) AS VARCHAR) AS avg_unit_cost,
          CAST(h.total_cost_fiat AS VARCHAR) AS total_cost_fiat,
          h.currency,
          h.portfolio_locations,
          CAST(lp.close AS VARCHAR) AS live_price,
          CAST(CAST(CAST(h.total_qty AS DOUBLE) * CAST(lp.close AS DOUBLE) AS DECIMAL(38,18)) AS VARCHAR) AS current_value_fiat,
          CAST(CAST(CAST(h.total_qty AS DOUBLE) * CAST(lp.close AS DOUBLE) - CAST(h.total_cost_fiat AS DOUBLE) AS DECIMAL(38,18)) AS VARCHAR) AS unrealized_pnl_fiat
      FROM holdings h
      LEFT JOIN latest_prices lp ON h.symbol = lp.symbol
    `;

    const results = await this.db.queryMany<RawHoldingsRow>(sql, params);
    return results.map((r) => ({
      assetId: r.asset_id,
      symbol: r.symbol,
      totalQty: r.total_qty,
      avgUnitCost: r.avg_unit_cost,
      totalCostFiat: r.total_cost_fiat,
      currency: r.currency,
      portfolioLocations: parseStringArray(r.portfolio_locations),
      livePrice: r.live_price ?? undefined,
      currentValueFiat: r.current_value_fiat ?? undefined,
      unrealizedPnlFiat: r.unrealized_pnl_fiat ?? undefined,
    }));
  }

  public async getDerivativesPnl(
    accountId?: string,
    targetCurrency = 'USD',
  ): Promise<DerivativesPnl[]> {
    const params: unknown[] = [targetCurrency];
    let whereClause = '';

    if (accountId) {
      params.push(accountId);
      whereClause = `AND ft.account_id = $${params.length}`;
    }

    const sql = `
      SELECT
          ft.symbol,
          ft.symbol AS contractName,
          CAST(SUM(CAST(ft.realized_pnl AS DECIMAL(38,18))) AS VARCHAR) AS realizedPnl,
          CAST(SUM(CAST(COALESCE(ft.funding_amount, '0.00') AS DECIMAL(38,18))) AS VARCHAR) AS funding,
          CAST(SUM(CAST(COALESCE(ft.fee_amount, '0.00') AS DECIMAL(38,18))) AS VARCHAR) AS fees,
          CAST(SUM(CAST(ft.realized_pnl AS DECIMAL(38,18)) + CAST(COALESCE(ft.funding_amount, '0.00') AS DECIMAL(38,18)) - CAST(COALESCE(ft.fee_amount, '0.00') AS DECIMAL(38,18))) AS VARCHAR) AS netPnl,
          COALESCE(MAX(ft.fiat_currency), $1) AS currency
      FROM ledger.futures_transactions ft
      WHERE ft.status = 'COMPLETED'
        AND ft.deleted_at IS NULL
        ${whereClause}
      GROUP BY ft.symbol
    `;

    const results = await this.db.queryMany<RawDerivativesPnlRow>(sql, params);
    return results.map((r) => ({
      symbol: r.symbol,
      contractName: r.contractName,
      realizedPnl: r.realizedPnl,
      funding: r.funding,
      fees: r.fees,
      netPnl: r.netPnl,
      currency: r.currency,
    }));
  }
}
