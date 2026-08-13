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
    SELECT asset_id, remaining_qty, original_qty, unit_cost_fiat, total_cost_fiat, fiat_currency,
           CAST(acquisition_timestamp AS DATE) AS acquired_on, status, quality_flag
    FROM v_calculated_tax_lots
    UNION ALL
    SELECT asset_id, remaining_qty, original_qty, unit_cost_fiat, total_cost_fiat, fiat_currency,
           CAST(acquisition_timestamp AS DATE) AS acquired_on, status, quality_flag
    FROM ledger.tax_lots
    WHERE spot_transaction_id IS NULL OR spot_transaction_id NOT IN (SELECT tx_id FROM v_flattened_fifo_events)
`;

/** The dual-source event set, identical wherever realized PnL is summed. */
const REALIZED_EVENTS = `
    SELECT gain_loss_fiat, fiat_currency, CAST(disposal_date AS DATE) AS disposal_on
    FROM ledger.lot_history_events
    UNION ALL
    SELECT gain_loss_fiat, fiat_currency, CAST(disposal_date AS DATE) AS disposal_on
    FROM v_calculated_lot_history_events
    WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
`;

/**
 * A realized gain converted at the rate of the day it was realized.
 *
 * Not the latest rate: a disposal is a completed event, and expressing what it earned
 * using today's FX would report a gain the user never made. The identity case is cut in
 * the join predicate, so a gain already in the display currency reads no rate at all.
 */
const REALIZED_EVENTS_CONVERTED = (param: string) => `
    SELECT
        CAST(CAST(e.gain_loss_fiat AS DECIMAL(38,18))
             * COALESCE(fx.rate, CAST(1 AS DECIMAL(18,12))) AS DECIMAL(38,18)) AS gain_loss_fiat,
        e.fiat_currency <> ${param} AND fx.rate IS NULL AS unconvertible
    FROM (${REALIZED_EVENTS}) e
    ASOF LEFT JOIN v_fx_daily fx
      ON fx.pair = e.fiat_currency || '/' || ${param}
     AND e.fiat_currency <> ${param}
     AND fx.rate_date <= e.disposal_on
`;

/**
 * The three shared sources, pinned into temp tables once per call.
 *
 * Measured on an empty ledger: eleven statements each re-planning and re-executing the FIFO chain
 * cost ~1390 ms; pinning the shared sources first brings the same eleven statements to ~910 ms.
 * Collapsing them into a single statement was tried instead and measured 1.5x WORSE — the cost is
 * per-statement work over a deep view chain, not one expensive scan, so the fix is to make the chain
 * run once, not to make the plan bigger.
 *
 * Refreshed on every call: a cached table would report figures from before the last rebuild.
 */
/**
 * The daily series, converted at each point's OWN date.
 *
 * `v_portfolio_daily_valuation` aggregates in canonical EUR, because it sums assets whose price
 * series are denominated differently and must reduce them to one unit first. Converting that result
 * into the display currency is this query's job, and it is done per date rather than by scaling the
 * finished series by a single rate — a uniformly scaled chart shows today's FX applied to every
 * point in history, which is a different shape, not merely a different unit.
 *
 * A point the FX ledger cannot cover stays NULL and keeps its unconvertible mark, rather than
 * passing through at a factor of one. The EUR-to-display hop can only fail for a missing rate,
 * so it never touches `unpriced`, which the view keeps separate for a different remedy.
 */
const VALUATION_CONVERTED = `
    SELECT * REPLACE (
        CASE WHEN v.daily_value IS NULL OR ($1 <> 'EUR' AND fx.rate IS NULL) THEN NULL
             ELSE CAST(v.daily_value * COALESCE(fx.rate, CAST(1 AS DECIMAL(18,12))) AS DECIMAL(38,18))
        END AS daily_value,
        v.unconvertible OR ($1 <> 'EUR' AND fx.rate IS NULL) AS unconvertible
    )
    FROM v_portfolio_daily_valuation v
    ASOF LEFT JOIN v_fx_daily fx
      ON fx.pair = 'EUR/' || $1
     AND $1 <> 'EUR'
     AND fx.rate_date <= v.date
`;

const PINNED_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['kpi_open_lots', OPEN_LOTS_WITH_QUALITY],
  ['kpi_valuation', VALUATION_CONVERTED],
  ['kpi_events', REALIZED_EVENTS],
  // Read by both the volatility and the Sharpe statement, so pinning it pays for itself once.
  ['kpi_returns_volatility', 'SELECT * FROM v_portfolio_returns_volatility'],
];

const TRUSTWORTHY_OPEN_LOTS = `
    SELECT * FROM kpi_open_lots
    WHERE status IN ('OPEN', 'PARTIAL')
      AND COALESCE(quality_flag, '') NOT IN ${UNTRUSTWORTHY_BASIS_FLAGS}
`;

export class DuckDbMetricsAdapter implements IMetricsPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  public async getKpis(targetCurrency?: string): Promise<MetricsKpis> {
    const displayCurrency = targetCurrency ?? 'EUR';
    for (const [table, source] of PINNED_SOURCES) {
      // Only the sources that actually reference $1 are given one: DuckDB rejects a bound value
      // a statement has no placeholder for, so passing it unconditionally fails to bind.
      const params = source.includes('$1') ? [displayCurrency] : undefined;
      await this.db.execute(`CREATE OR REPLACE TEMP TABLE ${table} AS ${source}`, params);
    }

    const valuation = await this.db.queryOne<{
      total_equity: string;
    }>(`
      SELECT
          CAST(COALESCE(SUM(daily_value), 0.0) AS VARCHAR) AS total_equity
      FROM kpi_valuation
      WHERE date = (SELECT MAX(date) FROM kpi_valuation)
    `);

    const costRes = await this.db.queryOne<{
      total_cost: string;
    }>(
      `
      -- Scales allocated from measurement, not inherited. On the real ledger:
      -- quantities carry at most 8 significant decimals, unit costs carry more than 12 in
      -- 638 of 639 lots, and the largest monetary integer part is 5 digits. So the decimals
      -- belong on the cost, not on the quantity — the reverse of what this expression used
      -- to do. DECIMAL(38,18) x DECIMAL(22,8) is DECIMAL(38,26): 12 integer digits, a
      -- ceiling of 1e12 against a largest observed figure of 79163, and a unit cost that
      -- stays intact well below any price that exists.
      -- Converted per lot at its own acquisition date, exactly as the holdings snapshot does,
      -- so the two figures a user sees side by side cannot disagree. An untouched lot uses its
      -- recorded total; only a partially disposed one is rebuilt from the derived unit cost.
      SELECT CAST(COALESCE(SUM(CASE
          WHEN l.remaining_qty = l.original_qty
              THEN CAST(CAST(l.total_cost_fiat AS DECIMAL(38,18)) * l.display_rate AS DECIMAL(38,18))
          ELSE CAST(
              CAST(CAST(l.unit_cost_fiat AS DECIMAL(38,18)) * l.display_rate AS DECIMAL(38,18))
              * CAST(l.remaining_qty AS DECIMAL(22,8))
          AS DECIMAL(38,18))
      END), CAST(0 AS DECIMAL(38,18))) AS VARCHAR) AS total_cost
      -- A lot the FX ledger cannot cover is left out of the total rather than added at a factor of
      -- one, which would put a euro figure into a dollar sum at its euro value — the right order of
      -- magnitude and therefore the most expensive kind of wrong. What makes the omission honest
      -- rather than silent is rates_incomplete below, which is derived from the same predicate.
      FROM (
          SELECT t.*, COALESCE(fx.rate, CAST(1 AS DECIMAL(18,12))) AS display_rate
          FROM (${TRUSTWORTHY_OPEN_LOTS}) t
          ASOF LEFT JOIN v_fx_daily fx
            ON fx.pair = t.fiat_currency || '/' || $1
           AND t.fiat_currency <> $1
           AND fx.rate_date <= t.acquired_on
          WHERE t.fiat_currency = $1 OR fx.rate IS NOT NULL
      ) l
    `,
      [displayCurrency],
    );

    // Any figure feeding a total that could not reach the display currency, and — separately —
    // any asset whose value is absent because nothing ever priced it. Read from the same pinned
    // sources the totals are summed from, so neither flag can disagree with them.
    //
    // The two are reported apart because their remedies are opposites: an unresolved rate is
    // fixed by seeding the FX ledger, an unpriced asset by seeding the price series. Together in
    // one boolean, a ledger with complete FX coverage and a single unpriced asset announced its
    // exchange rates incomplete and sent the user to the wrong one.
    //
    // Two independent booleans rather than a union: a portfolio can genuinely exhibit either,
    // both, or neither, and neither carries a payload the other's absence would make meaningless
    // — the state a union exists to make unrepresentable does not exist here.
    const incompleteRes = await this.db.queryOne<{
      rates_incomplete: boolean;
      prices_incomplete: boolean;
    }>(
      `
      SELECT
          (
              EXISTS (SELECT 1 FROM kpi_valuation WHERE unconvertible)
              OR EXISTS (
                  SELECT 1 FROM (${TRUSTWORTHY_OPEN_LOTS}) t
                  ASOF LEFT JOIN v_fx_daily fx
                    ON fx.pair = t.fiat_currency || '/' || $1
                   AND t.fiat_currency <> $1
                   AND fx.rate_date <= t.acquired_on
                  WHERE t.fiat_currency <> $1 AND fx.rate IS NULL
              )
          ) AS rates_incomplete,
          EXISTS (SELECT 1 FROM kpi_valuation WHERE unpriced) AS prices_incomplete
    `,
      [displayCurrency],
    );

    const flaggedLotsRes = await this.db.queryOne<{
      flagged_lots: number;
    }>(`
      SELECT CAST(COUNT(*) AS INTEGER) AS flagged_lots
      FROM kpi_open_lots
      WHERE status IN ('OPEN', 'PARTIAL')
        AND COALESCE(quality_flag, '') IN ${UNTRUSTWORTHY_BASIS_FLAGS}
    `);

    const delta24hRes = await this.db.queryOne<{
      delta_24h: string;
    }>(`
      WITH daily_totals AS (
          SELECT date, SUM(daily_value) AS portfolio_value
          FROM kpi_valuation
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
      FROM kpi_returns_volatility
      ORDER BY date DESC
      LIMIT 1
    `);

    const spotPnlRes = await this.db.queryOne<{ spot_pnl: string }>(
      `
      SELECT CAST(COALESCE(SUM(gain_loss_fiat), CAST(0 AS DECIMAL(38,18))) AS VARCHAR) AS spot_pnl
      FROM (${REALIZED_EVENTS_CONVERTED('$1')})
    `,
      [displayCurrency],
    );

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
      FROM kpi_returns_volatility
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
          SELECT CAST(gain_loss_fiat AS DECIMAL(38,18)) AS pnl FROM kpi_events
          UNION ALL
          SELECT CAST(CAST(pnl_fiat AS DECIMAL(38,18)) - CAST(fee_fiat AS DECIMAL(38,18)) AS DECIMAL(38,18)) AS pnl
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
              SUM(CAST(l.remaining_qty AS DECIMAL(38,18))) AS total_qty,
              SUM(CAST(CAST(l.unit_cost_fiat AS DECIMAL(38,18)) * CAST(l.remaining_qty AS DECIMAL(22,8)) AS DECIMAL(38,18))) AS total_cost_fiat
          FROM (${TRUSTWORTHY_OPEN_LOTS}) l
          LEFT JOIN ledger.assets ast ON l.asset_id = ast.id OR l.asset_id = ast.symbol
          GROUP BY COALESCE(ast.symbol, l.asset_id)
      ),
      latest_prices AS (
          -- Decimal, because this price is multiplied into current_value_fiat below; a
          -- DOUBLE here would put the money back into floating point one join later.
          SELECT symbol, CAST(close AS DECIMAL(38,18)) AS close
          FROM historical_prices
          QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) = 1
      ),
      asset_performance AS (
          SELECT
              h.symbol,
              h.symbol AS name,
              h.total_cost_fiat AS cost_fiat,
              CASE
                  WHEN COALESCE(lp.close, CAST(0 AS DECIMAL(38,18))) > 0
                      THEN CAST(lp.close * CAST(h.total_qty AS DECIMAL(22,8)) AS DECIMAL(38,18))
                  ELSE h.total_cost_fiat
              END AS current_value_fiat,
              SUM(
                  CASE
                      WHEN COALESCE(lp.close, CAST(0 AS DECIMAL(38,18))) > 0
                          THEN CAST(lp.close * CAST(h.total_qty AS DECIMAL(22,8)) AS DECIMAL(38,18))
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
                  -- A ratio, not a monetary amount, and DECIMAL / DECIMAL returns DOUBLE in
                  -- DuckDB regardless. Cast explicitly so the type is stated rather than inferred.
                  WHEN total_portfolio_value > 0
                      THEN CAST((current_value_fiat / total_portfolio_value) * 100.0 AS DOUBLE)
                  ELSE 0.0
              END AS allocation_pct,
              CASE
                  WHEN cost_fiat > 0
                      THEN CAST(((current_value_fiat - cost_fiat) / cost_fiat) * 100.0 AS DOUBLE)
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
      ratesIncomplete: incompleteRes?.rates_incomplete === true,
      pricesIncomplete: incompleteRes?.prices_incomplete === true,
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
