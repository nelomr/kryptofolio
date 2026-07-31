import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
  IMetricsPort,
  MetricsKpis,
  AssetKpiSummary,
  PerformanceHistoryPoint,
  AssetAllocationItem,
  VolatilityHeatmapCell,
  RiskMetrics,
  DrawdownPoint,
} from '../../domain/ports/IMetricsPort.js';
import Decimal from 'decimal.js';
import { generateAssetColor } from '@kryptofolio/shared-types';

/**
 * Lots whose cost basis is not trustworthy enough to aggregate.
 *
 * A negative basis inverts the sign of every gain derived from it; an unresolved one is stored as
 * `0` because the column is NOT NULL, which reads as "acquired for free". Either one silently
 * corrupts a portfolio total, so both are held out of the headline figure and counted instead.
 */
const UNTRUSTWORTHY_BASIS_FLAGS = "('NEGATIVE_COST_BASIS', 'MISSING_PRICE')";

/**
 * The dual-source lot set: the materialised lots plus any calculated lot the materialiser has not
 * caught up with. Identical in both places it is used, so the two aggregations cannot disagree about
 * which lots they are counting.
 */
const OPEN_LOTS_WITH_QUALITY = `
    SELECT asset_id, remaining_qty, unit_cost_fiat, status, quality_flag FROM v_calculated_tax_lots
    UNION ALL
    SELECT asset_id, remaining_qty, unit_cost_fiat, status, quality_flag FROM ledger.tax_lots
    WHERE spot_transaction_id IS NULL OR spot_transaction_id NOT IN (SELECT tx_id FROM v_flattened_fifo_events)
`;

const TRUSTWORTHY_OPEN_LOTS = `
    SELECT * FROM (${OPEN_LOTS_WITH_QUALITY})
    WHERE status IN ('OPEN', 'PARTIAL')
      AND COALESCE(quality_flag, '') NOT IN ${UNTRUSTWORTHY_BASIS_FLAGS}
`;

export class DuckDbMetricsAdapter implements IMetricsPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  public async getKpis(targetCurrency?: string): Promise<MetricsKpis> {
    const valuation = await this.db.queryOne<{
      total_equity: string;
    }>(`
      SELECT
          CAST(COALESCE(SUM(daily_value), 0.0) AS VARCHAR) AS total_equity
      FROM v_portfolio_daily_valuation
      WHERE date = (SELECT MAX(date) FROM v_portfolio_daily_valuation)
    `);

    const costRes = await this.db.queryOne<{
      total_cost: string;
    }>(`
      SELECT CAST(COALESCE(SUM(
          CAST(remaining_qty AS DOUBLE) * CAST(unit_cost_fiat AS DOUBLE)
      ), 0.0) AS VARCHAR) AS total_cost
      FROM (${TRUSTWORTHY_OPEN_LOTS})
    `);

    const flaggedLotsRes = await this.db.queryOne<{
      flagged_lots: number;
    }>(`
      SELECT CAST(COUNT(*) AS INTEGER) AS flagged_lots
      FROM (${OPEN_LOTS_WITH_QUALITY})
      WHERE status IN ('OPEN', 'PARTIAL')
        AND COALESCE(quality_flag, '') IN ${UNTRUSTWORTHY_BASIS_FLAGS}
    `);

    const delta24hRes = await this.db.queryOne<{
      delta_24h: string;
    }>(`
      WITH daily_totals AS (
          SELECT date, SUM(daily_value) AS portfolio_value
          FROM v_portfolio_daily_valuation
          GROUP BY date
          ORDER BY date DESC
          LIMIT 2
      ),
      ranked AS (
          SELECT portfolio_value, ROW_NUMBER() OVER (ORDER BY date DESC) AS rn
          FROM daily_totals
      )
      SELECT CAST(COALESCE(
          MAX(CASE WHEN rn = 1 THEN portfolio_value END) -
          MAX(CASE WHEN rn = 2 THEN portfolio_value END),
          0.0
      ) AS VARCHAR) AS delta_24h
      FROM ranked
    `);

    const athDrawdown = await this.db.queryOne<{
      ath: string;
      max_dd: string;
      max_dd_fiat: string;
      recovered_fiat: string;
    }>(`
      SELECT
          CAST(COALESCE(MAX(rolling_ath), 0.0) AS VARCHAR) AS ath,
          CAST(COALESCE(MIN(drawdown_pct), 0.0) AS VARCHAR) AS max_dd,
          CAST(COALESCE(MIN(total_daily_value - rolling_ath), 0.0) AS VARCHAR) AS max_dd_fiat,
          CAST(COALESCE(
              (SELECT total_daily_value FROM v_portfolio_ath_drawdown ORDER BY date DESC LIMIT 1) - MIN(total_daily_value),
              0.0
          ) AS VARCHAR) AS recovered_fiat
      FROM v_portfolio_ath_drawdown
    `);

    const vol = await this.db.queryOne<{ vol: string }>(`
      SELECT CAST(COALESCE(annualized_volatility_all, 0.0) AS VARCHAR) AS vol
      FROM v_portfolio_returns_volatility
      ORDER BY date DESC
      LIMIT 1
    `);

    const spotPnlRes = await this.db.queryOne<{ spot_pnl: string }>(`
      SELECT CAST(COALESCE(SUM(CAST(gain_loss_fiat AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS spot_pnl
      FROM (
        SELECT gain_loss_fiat FROM ledger.lot_history_events
        UNION ALL
        SELECT gain_loss_fiat FROM v_calculated_lot_history_events
        WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
      )
    `);

    const futuresPnlRes = await this.db.queryOne<{ futures_pnl: string }>(`
      SELECT CAST(COALESCE(SUM(pnl_fiat - fee_fiat), 0.0) AS VARCHAR) AS futures_pnl
      FROM v_futures_realized_pnl
    `);

    const sharpeRes = await this.db.queryOne<{ sharpe: string }>(`
      SELECT
        CAST(
          CASE
            WHEN annualized_volatility_all > 0 THEN
              (AVG(CAST(daily_return AS DOUBLE)) OVER () * 365.0) / CAST(annualized_volatility_all AS DOUBLE)
            ELSE 0.0
          END AS VARCHAR
        ) AS sharpe
      FROM v_portfolio_returns_volatility
      ORDER BY date DESC
      LIMIT 1
    `);

    const winRateRes = await this.db.queryOne<{
      total_trades: number;
      winning_trades: number;
      losing_trades: number;
      win_rate_pct: number;
      average_r: number;
    }>(`
      WITH all_trades AS (
          SELECT CAST(gain_loss_fiat AS DOUBLE) AS pnl
          FROM ledger.lot_history_events
          UNION ALL
          SELECT CAST(gain_loss_fiat AS DOUBLE) AS pnl
          FROM v_calculated_lot_history_events
          WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
          UNION ALL
          SELECT CAST(pnl_fiat AS DOUBLE) - CAST(fee_fiat AS DOUBLE) AS pnl
          FROM v_futures_realized_pnl
      )
      SELECT
          CAST(COUNT(*) AS INTEGER) AS total_trades,
          CAST(COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0) AS INTEGER) AS winning_trades,
          CAST(COALESCE(SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END), 0) AS INTEGER) AS losing_trades,
          CAST(COALESCE(
              SUM(CASE WHEN pnl > 0 THEN 1.0 ELSE 0.0 END) * 100.0 / NULLIF(COUNT(*), 0),
              0.0
          ) AS DOUBLE) AS win_rate_pct,
          CAST(COALESCE(
              AVG(CASE WHEN pnl > 0 THEN pnl END)
              / NULLIF(ABS(AVG(CASE WHEN pnl < 0 THEN pnl END)), 0.0),
              0.0
          ) AS DOUBLE) AS average_r
      FROM all_trades
    `);

    const assetPerfRows = await this.db.queryMany<{
      symbol: string;
      name: string;
      allocation_pct: number;
      roi_pct: number;
    }>(`
      WITH holdings AS (
          SELECT
              COALESCE(ast.symbol, l.asset_id) AS symbol,
              SUM(CAST(l.remaining_qty AS DOUBLE)) AS total_qty,
              SUM(CAST(CAST(l.remaining_qty AS DOUBLE) * CAST(l.unit_cost_fiat AS DOUBLE) AS DOUBLE)) AS total_cost_fiat
          FROM (${TRUSTWORTHY_OPEN_LOTS}) l
          LEFT JOIN ledger.assets ast ON l.asset_id = ast.id OR l.asset_id = ast.symbol
          GROUP BY COALESCE(ast.symbol, l.asset_id)
      ),
      latest_prices AS (
          SELECT symbol, CAST(close AS DOUBLE) AS close
          FROM historical_prices
          QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) = 1
      ),
      asset_performance AS (
          SELECT
              h.symbol,
              h.symbol AS name,
              h.total_cost_fiat AS cost_fiat,
              CASE
                  WHEN COALESCE(lp.close, 0.0) > 0 THEN h.total_qty * lp.close
                  ELSE h.total_cost_fiat
              END AS current_value_fiat,
              SUM(
                  CASE
                      WHEN COALESCE(lp.close, 0.0) > 0 THEN h.total_qty * lp.close
                      ELSE h.total_cost_fiat
                  END
              ) OVER () AS total_portfolio_value
          FROM holdings h
          LEFT JOIN latest_prices lp ON h.symbol = lp.symbol
          WHERE h.total_qty > 0
      ),
      asset_metrics AS (
          SELECT
              symbol,
              name,
              CASE
                  WHEN total_portfolio_value > 0 THEN (current_value_fiat / total_portfolio_value) * 100.0
                  ELSE 0.0
              END AS allocation_pct,
              CASE
                  WHEN cost_fiat > 0 THEN ((current_value_fiat - cost_fiat) / cost_fiat) * 100.0
                  ELSE 0.0
              END AS roi_pct
          FROM asset_performance
      )
      SELECT * FROM asset_metrics ORDER BY roi_pct DESC
    `);

    let bestAsset: AssetKpiSummary | null = null;
    let worstAsset: AssetKpiSummary | null = null;
    if (assetPerfRows && assetPerfRows.length >= 2) {
      const best = assetPerfRows[0];
      const worst = assetPerfRows[assetPerfRows.length - 1];
      bestAsset = {
        symbol: best.symbol,
        name: best.name,
        allocationPct: Number(new Decimal(best.allocation_pct ?? 0).toFixed(2)),
        roiPct: Number(new Decimal(best.roi_pct ?? 0).toFixed(2)),
      };
      worstAsset = {
        symbol: worst.symbol,
        name: worst.name,
        allocationPct: Number(new Decimal(worst.allocation_pct ?? 0).toFixed(2)),
        roiPct: Number(new Decimal(worst.roi_pct ?? 0).toFixed(2)),
      };
    }

    const totalEquityDec = new Decimal(valuation?.total_equity ?? '0.00');
    const totalCostDec = new Decimal(costRes?.total_cost ?? '0.00');
    const unrealizedDec = totalEquityDec.sub(totalCostDec);
    const spotRealizedDec = new Decimal(spotPnlRes?.spot_pnl ?? '0');
    const futuresRealizedDec = new Decimal(futuresPnlRes?.futures_pnl ?? '0');
    const totalRealizedPnlDec = spotRealizedDec.add(futuresRealizedDec);
    const totalRoiFiatDec = unrealizedDec.add(totalRealizedPnlDec);
    const totalRoiPercentNum = totalCostDec.gt(0)
      ? totalRoiFiatDec.div(totalCostDec).mul(100).toNumber()
      : 0;

    const athDec = new Decimal(athDrawdown?.ath ?? '0.00');
    const maxDdDec = new Decimal(athDrawdown?.max_dd ?? '0.00');
    const maxDdFiatDec = new Decimal(athDrawdown?.max_dd_fiat ?? '0.00');
    const recoveredFiatDec = new Decimal(athDrawdown?.recovered_fiat ?? '0.00');
    const delta24hDec = new Decimal(delta24hRes?.delta_24h ?? '0.00');
    const annualizedVolDec = new Decimal(vol?.vol ?? '0.00');
    const sharpeDec = new Decimal(sharpeRes?.sharpe ?? '0.00');

    return {
      totalEquity: totalEquityDec.toFixed(2),
      totalCostBasis: totalCostDec.toFixed(2),
      totalUnrealizedPnl: unrealizedDec.toFixed(2),
      totalRealizedPnl: totalRealizedPnlDec.toFixed(2),
      allTimeHigh: athDec.toFixed(2),
      maxDrawdownPct: maxDdDec.toFixed(4),
      annualizedVolatility: annualizedVolDec.toFixed(4),
      sharpeRatio: sharpeDec.toFixed(4),
      currency: targetCurrency ?? 'EUR',
      delta24hFiat: delta24hDec.toFixed(2),
      maxDrawdownFiat: maxDdFiatDec.toFixed(2),
      recoveredFiat: recoveredFiatDec.toFixed(2),
      winRatePercent: Number(new Decimal(winRateRes?.win_rate_pct ?? 0).toFixed(2)),
      totalTrades: winRateRes?.total_trades ?? 0,
      winningTrades: winRateRes?.winning_trades ?? 0,
      losingTrades: winRateRes?.losing_trades ?? 0,
      averageR: Number(new Decimal(winRateRes?.average_r ?? 0).toFixed(2)),
      bestAsset,
      worstAsset,
      totalRoiPercent: Number(new Decimal(totalRoiPercentNum).toFixed(2)),
      totalRoiFiat: totalRoiFiatDec.toFixed(2),
      excludedFlaggedLots: Number(flaggedLotsRes?.flagged_lots ?? 0),
    };
  }

  public async getPerformanceHistory(
    days = 30,
    _targetCurrency?: string,
  ): Promise<PerformanceHistoryPoint[]> {
    const rows = await this.db.queryMany<{
      date: string;
      total_value: string;
      drawdown_pct: string;
    }>(
      `
      SELECT
          CAST(v.date AS VARCHAR) AS date,
          CAST(SUM(v.daily_value) AS VARCHAR) AS total_value,
          CAST(COALESCE(d.drawdown_pct, 0.0) AS VARCHAR) AS drawdown_pct
      FROM v_portfolio_daily_valuation v
      LEFT JOIN v_portfolio_ath_drawdown d ON v.date = d.date
      GROUP BY v.date, d.drawdown_pct
      ORDER BY v.date DESC
      LIMIT $1
    `,
      [days],
    );

    return rows.reverse().map((r) => ({
      date: r.date,
      portfolioValue: new Decimal(r.total_value).toFixed(2),
      drawdownPct: new Decimal(r.drawdown_pct).toFixed(4),
    }));
  }

  public async getAssetAllocation(
    targetCurrency?: string,
  ): Promise<AssetAllocationItem[]> {
    const rows = await this.db.queryMany<{
      asset_id: string;
      symbol: string;
      value_fiat: string;
      total_portfolio: string;
    }>(`
      WITH latest_val AS (
          SELECT
              asset_id,
              symbol,
              daily_value,
              SUM(daily_value) OVER () AS total_portfolio
          FROM v_portfolio_daily_valuation
          WHERE date = (SELECT MAX(date) FROM v_portfolio_daily_valuation)
      )
      SELECT
          asset_id,
          symbol,
          CAST(daily_value AS VARCHAR) AS value_fiat,
          CAST(total_portfolio AS VARCHAR) AS total_portfolio
      FROM latest_val
    `);

    return rows.map((r, idx) => {
      const val = new Decimal(r.value_fiat);
      const total = new Decimal(r.total_portfolio);
      const pct = total.gt(0) ? val.div(total).mul(100).toFixed(2) : '0.00';
      return {
        assetId: r.asset_id,
        symbol: r.symbol,
        color: generateAssetColor(r.symbol, idx),
        allocationPct: pct,
        valueFiat: val.toFixed(2),
        currency: targetCurrency ?? 'EUR',
      };
    });
  }

  public async getVolatilityHeatmap(
    year?: number,
    _targetCurrency?: string,
  ): Promise<VolatilityHeatmapCell[]> {
    const targetYear = year ?? new Date().getFullYear();
    const rows = await this.db.queryMany<{
      date: string;
      volatility: string;
    }>(
      `
      SELECT
          CAST(date AS VARCHAR) AS date,
          CAST(COALESCE(annualized_volatility_30d, 0.0) AS VARCHAR) AS volatility
      FROM v_portfolio_returns_volatility
      WHERE YEAR(date) = $1
      ORDER BY date ASC
    `,
      [targetYear],
    );

    return rows.map((r) => ({
      date: r.date,
      volatility: new Decimal(r.volatility).toFixed(4),
    }));
  }

  public async getRiskMetrics(
    targetCurrency?: string,
  ): Promise<RiskMetrics> {
    const alphaBeta = await this.db.queryOne<{ alpha: string; beta: string }>(`
      SELECT
          CAST(alpha AS VARCHAR) AS alpha,
          CAST(beta AS VARCHAR) AS beta
      FROM v_portfolio_alpha_beta
    `);

    const athDrawdown = await this.db.queryOne<{ max_dd: string }>(`
      SELECT CAST(COALESCE(MIN(drawdown_pct), 0.0) AS VARCHAR) AS max_dd
      FROM v_portfolio_ath_drawdown
    `);

    const vol = await this.db.queryOne<{ vol: string }>(`
      SELECT CAST(COALESCE(annualized_volatility_all, 0.0) AS VARCHAR) AS vol
      FROM v_portfolio_returns_volatility
      ORDER BY date DESC
      LIMIT 1
    `);

    const sharpeRes = await this.db.queryOne<{ sharpe: string }>(`
      SELECT
        CAST(
          CASE
            WHEN annualized_volatility_all > 0 THEN
              (AVG(CAST(daily_return AS DOUBLE)) OVER () * 365.0) / CAST(annualized_volatility_all AS DOUBLE)
            ELSE 0.0
          END AS VARCHAR
        ) AS sharpe
      FROM v_portfolio_returns_volatility
      ORDER BY date DESC
      LIMIT 1
    `);

    return {
      maxDrawdownPct: new Decimal(athDrawdown?.max_dd ?? '0.00').toFixed(4),
      annualizedVolatility: new Decimal(vol?.vol ?? '0.00').toFixed(4),
      sharpeRatio: new Decimal(sharpeRes?.sharpe ?? '0.00').toFixed(4),
      alpha: new Decimal(alphaBeta?.alpha ?? '0.00').toFixed(4),
      beta: new Decimal(alphaBeta?.beta ?? '1.00').toFixed(4),
      currency: targetCurrency ?? 'EUR',
    };
  }

  public async getDrawdownCurve(
    days = 30,
    _targetCurrency?: string,
  ): Promise<DrawdownPoint[]> {
    const rows = await this.db.queryMany<{
      date: string;
      drawdown_pct: string;
    }>(
      `
      SELECT
          CAST(date AS VARCHAR) AS date,
          CAST(drawdown_pct AS VARCHAR) AS drawdown_pct
      FROM v_portfolio_ath_drawdown
      ORDER BY date DESC
      LIMIT $1
    `,
      [days],
    );

    return rows.reverse().map((r) => ({
      date: r.date,
      drawdownPct: new Decimal(r.drawdown_pct).toFixed(4),
    }));
  }
}
