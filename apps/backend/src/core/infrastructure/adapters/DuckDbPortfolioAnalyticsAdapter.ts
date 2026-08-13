import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
  IPortfolioAnalyticsPort,
  HoldingsSnapshot,
  DerivativesPnl,
} from '../../domain/ports/IPortfolioAnalyticsPort.js';
import { isSupportedCurrency, type FiatCurrency } from '@kryptofolio/shared-types';
import { toConvertedAmount } from './convertedAmount.js';

interface RawHoldingsRow {
  fiat_currency: string | null;
  basis_rate: string | null;
  basis_rate_date: string | null;
  unconvertible: boolean | null;
  asset_id: string;
  symbol: string;
  total_qty: string;
  avg_unit_cost: string;
  total_cost_fiat: string;
  native_cost_fiat: string;
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
    // The port takes a plain string because the setting it comes from is a free-text KV. Narrowed
    // once here, so the currency bound into the query and the currency named in the returned
    // outcome are the same value — deriving them separately is how the two drift apart.
    const displayCurrency: FiatCurrency = isSupportedCurrency(targetCurrency)
      ? targetCurrency
      : 'USD';
    const params: unknown[] = [displayCurrency];
    let whereClause = '';

    if (accountId) {
      params.push(accountId);
      whereClause = `AND l.account_id = $${params.length}`;
    }

    const sql = `
      WITH lots AS (
          SELECT asset_id, account_id, exchange_location, remaining_qty, original_qty,
                 unit_cost_fiat, total_cost_fiat, fiat_currency, status,
                 CAST(acquisition_timestamp AS DATE) AS acquired_on
          FROM v_calculated_tax_lots
          UNION ALL
          SELECT asset_id, account_id, exchange_location, remaining_qty, original_qty,
                 unit_cost_fiat, total_cost_fiat, fiat_currency, status,
                 CAST(acquisition_timestamp AS DATE) AS acquired_on
          FROM ledger.tax_lots
          WHERE spot_transaction_id IS NULL OR spot_transaction_id NOT IN (SELECT tx_id FROM v_flattened_fifo_events)
      ),
      -- Conversion happens per lot, before any SUM. Two lots of one asset can differ in both
      -- native currency and acquisition date, so converting the aggregate would apply a single
      -- rate to figures that each earn their own — which is the defect this change exists to fix.
      --
      -- The identity case is excluded in the JOIN predicate rather than by a CASE over its result:
      -- where the currencies match, no row of the FX ledger is read at all, and the factor is the
      -- literal 1. exchange_rates holds USD/EUR only, so EUR/USD is an inversion bounded at twelve
      -- places; a USD figure displayed in USD that round-tripped would come back changed in its
      -- last places, and a conversion to the currency you were already in must be the identity.
      lots_converted AS (
          SELECT
              l.*,
              COALESCE(fx.rate, CAST(1 AS DECIMAL(18,12))) AS display_rate,
              fx.rate_date AS display_rate_date,
              l.fiat_currency <> $1 AND fx.rate IS NULL AS unconvertible
          FROM lots l
          ASOF LEFT JOIN v_fx_daily fx
            ON fx.pair = l.fiat_currency || '/' || $1
           AND l.fiat_currency <> $1
           AND fx.rate_date <= l.acquired_on
      ),
      -- Both the native and the converted basis, per lot, because the two answer different
      -- questions and the honest figure for a lot that could not be converted is the native one.
      --
      -- Scales allocated from measurement, not inherited. On the real ledger:
      -- quantities carry at most 8 significant decimals, unit costs carry more than 12 in
      -- 638 of 639 lots, and the largest monetary integer part is 5 digits. So the decimals
      -- belong on the cost, not on the quantity — the reverse of what this expression used
      -- to do. DECIMAL(38,18) x DECIMAL(22,8) is DECIMAL(38,26): 12 integer digits, a
      -- ceiling of 1e12 against a largest observed figure of 79163, and a unit cost that
      -- stays intact well below any price that exists.
      -- An untouched lot uses its own recorded total; only a partially disposed one is
      -- rebuilt from the unit cost. The unit cost is DERIVED — basis / quantity, a division
      -- DuckDB evaluates in DOUBLE — so rebuilding a whole lot's total from it reintroduces
      -- a residue the recorded total never had. That is not hypothetical: with the quotient
      -- bounded at sixteen significant digits, a basis of 0.3 over 3 units came back as
      -- 0.299999999999999970, and bounding at fifteen instead fixed that while breaking the
      -- bit-for-bit identity this change also requires. The two cannot both be satisfied by
      -- one rounding bound, so the fix is to stop deriving what is already recorded.
      --
      -- The rate is applied to the per-unit or per-lot figure first and the product returns
      -- to DECIMAL(38,18) before meeting the quantity, which is what keeps the twelve
      -- integer digits the portfolio total needs.
      lots_valued AS (
          SELECT
              l.*,
              CASE
                  WHEN l.remaining_qty = l.original_qty
                      THEN CAST(l.total_cost_fiat AS DECIMAL(38,18))
                  ELSE CAST(
                      CAST(l.unit_cost_fiat AS DECIMAL(38,18))
                      * CAST(l.remaining_qty AS DECIMAL(22,8))
                  AS DECIMAL(38,18))
              END AS native_basis,
              CASE
                  WHEN l.remaining_qty = l.original_qty
                      THEN CAST(CAST(l.total_cost_fiat AS DECIMAL(38,18)) * l.display_rate AS DECIMAL(38,18))
                  ELSE CAST(
                      CAST(CAST(l.unit_cost_fiat AS DECIMAL(38,18)) * l.display_rate AS DECIMAL(38,18))
                      * CAST(l.remaining_qty AS DECIMAL(22,8))
                  AS DECIMAL(38,18))
              END AS converted_basis
          FROM lots_converted l
      ),
      -- Present-value figures take the latest rate in the ledger, not the acquisition date's:
      -- a holding's current worth is a statement about today.
      latest_fx AS (
          SELECT pair, rate, rate_date
          FROM v_fx_daily
          QUALIFY ROW_NUMBER() OVER (PARTITION BY pair ORDER BY rate_date DESC) = 1
      ),
      holdings AS (
          SELECT
              a.id AS asset_id,
              a.symbol,
              SUM(CAST(l.remaining_qty AS DECIMAL(38,18))) AS total_qty,
              SUM(l.converted_basis) AS total_cost_fiat,
              SUM(l.native_basis) AS native_cost_fiat,
              $1 AS currency,
              -- A product that lands on zero from two non-zero operands is not a cheap lot, it is a
              -- figure the destination scale cannot hold — and a cost basis of zero reads as a
              -- hundred-percent gain. It reports as unconvertible for the same reason a missing rate
              -- does: the view cannot express this figure in the requested currency.
              BOOL_OR(
                  l.unconvertible
                  OR (l.native_basis <> CAST(0 AS DECIMAL(38,18))
                      AND l.converted_basis = CAST(0 AS DECIMAL(38,18)))
              ) AS basis_unconvertible,
              MAX(l.display_rate_date) AS basis_rate_date,
              -- MIN, not MAX: the outcome an asset reports is the weakest of its lots. Reporting
              -- the newest rate of a set where one lot resolved none would present a converted
              -- figure that some of its parts are not.
              MIN(l.fiat_currency) AS fiat_currency,
              MIN(CAST(l.display_rate AS VARCHAR)) AS basis_rate,
              TO_JSON(ARRAY_AGG(DISTINCT COALESCE(acc.name, l.exchange_location, 'Unknown'))) AS portfolio_locations
          FROM ledger.assets a
          JOIN lots_valued l ON (a.id = l.asset_id OR a.symbol = l.asset_id)
          LEFT JOIN ledger.accounts acc ON l.account_id = acc.id
          WHERE l.status IN ('OPEN', 'PARTIAL')
          ${whereClause}
          GROUP BY a.id, a.symbol
      ),
      latest_prices AS (
          SELECT symbol, close, currency
          FROM historical_prices
          QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) = 1
      )
      SELECT
          h.asset_id,
          h.symbol,
          CAST(h.total_qty AS VARCHAR) AS total_qty,
          -- The one money expression here that stays DOUBLE, and by engine constraint rather
          -- than by choice: DECIMAL / DECIMAL returns DOUBLE in DuckDB and cannot be made
          -- exact. It is therefore bounded explicitly at twelve places instead of being left
          -- to float formatting. This is a display figure only — the cost basis is
          -- total_cost_fiat, which is exact above, and nothing derives a basis or a tax
          -- figure from this column.
          CAST(CAST(PRINTF('%.12f', CAST(h.total_cost_fiat AS DOUBLE) / CAST(h.total_qty AS DOUBLE)) AS DECIMAL(38,18)) AS VARCHAR) AS avg_unit_cost,
          CAST(h.total_cost_fiat AS VARCHAR) AS total_cost_fiat,
          CAST(h.native_cost_fiat AS VARCHAR) AS native_cost_fiat,
          h.currency,
          h.portfolio_locations,
          CAST(lp.close AS VARCHAR) AS live_price,
          CAST(CAST(
              CAST(CAST(lp.close AS DECIMAL(38,18)) * COALESCE(pfx.rate, CAST(1 AS DECIMAL(18,12))) AS DECIMAL(38,18))
              * CAST(h.total_qty AS DECIMAL(22,8))
          AS DECIMAL(38,18)) AS VARCHAR) AS current_value_fiat,
          -- Derived from the two converted terms above rather than converted itself. Unrealized PnL
          -- is definitionally value minus basis, and those two convert at different dates — the
          -- basis at acquisition, the value at the latest rate. Converting the difference separately
          -- would apply a third rate and the three figures would not reconcile on screen.
          CAST(CAST(
              CAST(
                  CAST(CAST(lp.close AS DECIMAL(38,18)) * COALESCE(pfx.rate, CAST(1 AS DECIMAL(18,12))) AS DECIMAL(38,18))
                  * CAST(h.total_qty AS DECIMAL(22,8))
              AS DECIMAL(38,18))
              - CAST(h.total_cost_fiat AS DECIMAL(38,18))
          AS DECIMAL(38,18)) AS VARCHAR) AS unrealized_pnl_fiat,
          CAST(h.basis_rate_date AS VARCHAR) AS basis_rate_date,
          h.fiat_currency,
          h.basis_rate,
          CAST(pfx.rate_date AS VARCHAR) AS present_rate_date,
          h.basis_unconvertible OR (lp.currency IS NOT NULL AND lp.currency <> $1 AND pfx.rate IS NULL) AS unconvertible
      FROM holdings h
      LEFT JOIN latest_prices lp ON h.symbol = lp.symbol
      LEFT JOIN latest_fx pfx
        ON pfx.pair = lp.currency || '/' || $1
       AND lp.currency <> $1
    `;

    const results = await this.db.queryMany<RawHoldingsRow>(sql, params);
    return results.map((r) => ({
      assetId: r.asset_id,
      symbol: r.symbol,
      totalQty: r.total_qty,
      avgUnitCost: r.avg_unit_cost,
      totalCostFiat: r.total_cost_fiat,
      costBasis: toConvertedAmount({
        amount: r.total_cost_fiat,
        nativeAmount: r.native_cost_fiat,
        nativeCurrency: r.fiat_currency,
        requested: displayCurrency,
        rate: r.basis_rate,
        rateDate: r.basis_rate_date,
        unconvertible: r.unconvertible === true,
      }),
      currency: displayCurrency,
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
