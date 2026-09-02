import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
  ConvertedDisposalEvent,
  DisposalEventScope,
  CustodyEntryRow,
  FifoDataQualityRow,
  ITaxCalculatorPort,
  LotCustodyLocationRow,
  LotCustodyRelocationRow,
  SpanishTaxBaseReport,
} from '../../domain/ports/ITaxCalculatorPort.js';
import {
  isSupportedCurrency,
  type ConvertedAmount,
  type DisposalType,
  type FiatCurrency,
  type FifoQualityFlag,
  type FiscalClassificationFlag,
  type ManualValueProvenance,
  type TaxLotType,
  type TaxLotEventType,
} from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';
import { toConvertedAmount } from './convertedAmount.js';

/**
 * The day a figure belongs to, from a column three ingestion paths have written differently: as an
 * ISO string, as epoch seconds and as epoch milliseconds. Derived rather than substring-ed, because
 * the first ten characters of an epoch number are not a date.
 */
const TIMESTAMP_DAY = (column: string): string => `
        CASE
          WHEN TRY_CAST(${column} AS BIGINT) IS NOT NULL AND TRY_CAST(${column} AS BIGINT) > 1000000000000
            THEN CAST(EPOCH_MS(CAST(${column} AS BIGINT)) AS DATE)
          WHEN TRY_CAST(${column} AS BIGINT) IS NOT NULL AND TRY_CAST(${column} AS BIGINT) > 1000000000
            THEN CAST(TO_TIMESTAMP(CAST(${column} AS BIGINT)) AS DATE)
          ELSE TRY_CAST(SUBSTR(CAST(${column} AS VARCHAR), 1, 10) AS DATE)
        END`;

/**
 * The rate each row earns: the latest one published on or before the row's own date.
 *
 * A tax base is a sum of completed events, and what an event earned was settled on its own day.
 * Converting the finished sum, or every event at today's rate, reports figures the user never
 * realised — and reports different ones each time the ECB publishes. The identity case is cut in the
 * join predicate rather than by a CASE over its result, so a figure already in the display currency
 * reads no row of the FX ledger at all.
 *
 * Expects the driving relation aliased `i`, carrying `fiat_currency` and `own_date`.
 */
const FX_AT_OWN_DATE = `
      ASOF LEFT JOIN v_fx_daily fx
        ON fx.pair = i.fiat_currency || '/' || $2
       AND i.fiat_currency <> $2
       AND fx.rate_date <= i.own_date`;

/**
 * One figure in the display currency, or NULL where no rate covers its date.
 *
 * NULL rather than the figure passed through at a factor of one: a dollar amount added to a euro
 * total as though it were euros is a wrong number that looks like a right one, and `SUM` skips
 * NULLs, so the total stays composed only of figures that reached the requested currency. What it
 * cost to skip them is reported separately — an omission the caller cannot see is the other half of
 * the same defect.
 */
const CONVERTED_AT_OWN_DATE = (amount: string): string => `
        CASE
          WHEN i.fiat_currency <> $2 AND fx.rate IS NULL THEN NULL
          ELSE CAST(CAST(${amount} AS DECIMAL(38,18))
                    * COALESCE(fx.rate, CAST(1 AS DECIMAL(18,12))) AS DECIMAL(38,18))
        END`;

/**
 * The wire shape of one converted disposal row.
 *
 * Both the converted and the native figure are selected: the converted one is what the caller wants,
 * the native one is the honest fallback when no rate covered the date, and deciding between them
 * needs both present at once.
 */
interface ConvertedDisposalEventRow {
  id: string;
  tax_lot_id: string;
  disposal_date: string;
  amount_from_lot: string;
  gain_loss: string | null;
  sale_price: string | null;
  native_gain_loss: string | null;
  native_sale_price: string | null;
  fiat_currency: string;
  display_rate: string | null;
  display_rate_date: string | null;
  unconvertible: boolean | null;
  is_taxable: number | bigint;
  disposal_type: DisposalType;
  flag: FiscalClassificationFlag | null;
  quality_flag: FifoQualityFlag | null;
  value_provenance: ManualValueProvenance | null;
  fx_rate: string | null;
  fx_rate_date: string | null;
  notes: string | null;
  asset_symbol: string | null;
  exchange_name: string | null;
}

export class DuckDbTaxCalculatorAdapter implements ITaxCalculatorPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  /**
   * Run the vectorized FIFO algorithm inside DuckDB and return the computed
   * tax lots and lot history events.
   */
  public async calculateLotsAndEvents(accountId?: string): Promise<{
    lots: TaxLotType[];
    events: TaxLotEventType[];
  }> {
    let lotsQuery = 'SELECT * FROM v_calculated_tax_lots';
    let eventsQuery = 'SELECT * FROM v_calculated_lot_history_events';
    const params: unknown[] = [];

    if (accountId) {
      params.push(accountId);
      // $1 is safe — DuckDB parameterized binding, not interpolation
      lotsQuery += ` WHERE account_id = $1`;
      eventsQuery += ` WHERE account_id = $1`;
    }

    // Both source views already carry this same ORDER BY in their own definitions, but DuckDB does
    // not guarantee a view's internal order survives an outer `SELECT * ... WHERE ...` — the WHERE
    // filter especially can produce a different physical plan than the view alone. This method's
    // callers (`GetTokenHistoryUseCase`, the FIFO materializer) render the returned arrays as-is,
    // with no re-sort of their own, so the guarantee has to be restated here.
    lotsQuery += ' ORDER BY acquisition_timestamp, source_tx_id';
    eventsQuery += ' ORDER BY disposal_date, id';

    const lots = (await this.db.queryMany(lotsQuery, params)) as TaxLotType[];
    const events = (await this.db.queryMany(
      eventsQuery,
      params,
    )) as TaxLotEventType[];

    return { lots, events };
  }

  /**
   * The double-entry custody projection: one debit and one credit per allocated slice of a lot.
   *
   * Both legs of a movement are returned even when `accountId` is given, unless that account is one
   * of them — the caller asked for what this account holds, not for a reconstructed movement.
   */
  public async calculateCustodyEntries(
    accountId?: string,
  ): Promise<CustodyEntryRow[]> {
    let query = `
      SELECT
          id,
          tax_lot_id,
          asset_id,
          account_id,
          qty_delta,
          occurred_at,
          spot_transaction_id
      FROM v_custody_entries
    `;
    const params: unknown[] = [];

    if (accountId) {
      params.push(accountId);
      // $1 is safe — DuckDB parameterized binding, not interpolation
      query += ` WHERE account_id = $1`;
    }

    query += ` ORDER BY occurred_at, spot_transaction_id, account_id, tax_lot_id`;

    return (await this.db.queryMany(query, params)) as CustodyEntryRow[];
  }

  /**
   * The net position the custody legs add up to, per lot and account.
   *
   * `is_synthetic` is cast to BOOLEAN and `qty` to VARCHAR at the boundary: the underlying columns
   * are a SQLite integer and a DECIMAL, and the port asks for a flag and a decimal string.
   */
  public async getLotCustodyLocations(
    accountId?: string,
  ): Promise<LotCustodyLocationRow[]> {
    let query = `
      SELECT
          tax_lot_id,
          asset_id,
          account_id,
          account_name,
          CAST(is_synthetic AS BOOLEAN) AS is_synthetic,
          parent_account_id,
          CAST(qty AS VARCHAR) AS qty
      FROM v_lot_current_location
    `;
    const params: unknown[] = [];

    if (accountId) {
      params.push(accountId);
      // $1 is safe — DuckDB parameterized binding, not interpolation
      query += ` WHERE account_id = $1`;
    }

    query += ` ORDER BY tax_lot_id, account_id`;

    return (await this.db.queryMany(query, params)) as LotCustodyLocationRow[];
  }

  /**
   * The relocations themselves, rather than the position they add up to.
   *
   * Both account names are resolved here so the read path never has to fetch accounts separately to
   * render a movement. A synthetic destination has no `accounts` row until one is created, so the
   * flag falls back to the naming contract — the same fallback `v_lot_current_location` uses.
   *
   * Scoped on either end: a movement is equally part of the sending and the receiving account's
   * history, and scoping on one side alone would hide half of every transfer.
   */
  public async getLotCustodyTimeline(
    accountId?: string,
  ): Promise<LotCustodyRelocationRow[]> {
    let query = `
      SELECT
          a.tax_lot_id,
          a.asset_id,
          a.spot_transaction_id,
          a.occurred_at,
          CAST(a.qty AS VARCHAR) AS qty,
          a.from_account_id,
          COALESCE(src.name, a.from_account_id) AS from_account_name,
          CAST(COALESCE(
              src.is_synthetic,
              CASE WHEN is_synthetic_account_name(a.from_account_id) THEN 1 ELSE 0 END
          ) AS BOOLEAN) AS from_is_synthetic,
          a.to_account_id,
          COALESCE(dst.name, a.to_account_id) AS to_account_name,
          CAST(COALESCE(
              dst.is_synthetic,
              CASE WHEN is_synthetic_account_name(a.to_account_id) THEN 1 ELSE 0 END
          ) AS BOOLEAN) AS to_is_synthetic
      FROM v_lot_custody_allocation a
      LEFT JOIN ledger.accounts src ON src.id = a.from_account_id
      LEFT JOIN ledger.accounts dst ON dst.id = a.to_account_id
    `;
    const params: unknown[] = [];

    if (accountId) {
      params.push(accountId);
      // $1 is safe — DuckDB parameterized binding, not interpolation
      query += ` WHERE a.from_account_id = $1 OR a.to_account_id = $1`;
    }

    query += ` ORDER BY a.tax_lot_id, a.occurred_at, a.allocation_step`;

    return (await this.db.queryMany(query, params)) as LotCustodyRelocationRow[];
  }

  /**
   * Defects are data, never an error condition: this returns rows and blocks nothing.
   *
   * Severity and the pending-review marker come from the seeded vocabulary in the engine, so there
   * is one ranking in the system rather than a second one restated here.
   */
  public async getDataQuality(
    accountId?: string,
  ): Promise<FifoDataQualityRow[]> {
    let query = `
      SELECT
          quality_flag,
          severity,
          asset_id,
          account_id,
          tx_id,
          occurred_at,
          detail_key,
          pending_review
      FROM v_fifo_data_quality
    `;
    const params: unknown[] = [];

    if (accountId) {
      params.push(accountId);
      // $1 is safe — DuckDB parameterized binding, not interpolation
      query += ` WHERE account_id = $1`;
    }

    query += ` ORDER BY severity, quality_flag, asset_id, account_id`;

    return (await this.db.queryMany(query, params)) as FifoDataQualityRow[];
  }

  /**
   * Per-event figures in the requested currency, each at its own disposal date.
   *
   * Deliberately a second query rather than a flag on `calculateLotsAndEvents`: that one feeds
   * `FifoMaterializerService`, which writes, and a converted figure reaching it is persisted
   * indistinguishably from a native one. See Decision 14.
   *
   * Reads the materialised table when it holds rows and the calculated view otherwise, which is the
   * same precedence the report's bases use — the two must not disagree about which events exist.
   */
  public async getConvertedDisposalEvents(
    scope: DisposalEventScope,
    accountId: string | undefined,
    displayCurrency: string,
  ): Promise<readonly ConvertedDisposalEvent[]> {
    const currency: FiatCurrency = isSupportedCurrency(displayCurrency)
      ? displayCurrency
      : 'EUR';

    // $1 is bound in both arms so the parameter numbering has no hole — DuckDB rejects a list whose
    // placeholders skip a position. Under ALL_TIME it is a predicate that is always true rather than
    // an absent parameter.
    const yearFilter =
      scope.kind === 'FISCAL_YEAR'
        ? `YEAR(${TIMESTAMP_DAY('disposal_date')}) = CAST($1 AS INTEGER)`
        : `$1 IS NOT NULL`;
    const params: unknown[] = [scope.kind === 'FISCAL_YEAR' ? scope.year : 1, currency];
    let accountFilter = '';

    if (accountId) {
      params.push(accountId);
      accountFilter = ` AND account_id = $3`;
    }

    const sql = `
      WITH events AS (
        SELECT id, tax_lot_id, gain_loss_fiat, sale_price_fiat, amount_from_lot, fiat_currency,
               disposal_date, account_id, CAST(is_taxable AS INTEGER) AS is_taxable, disposal_type,
               flag, quality_flag, value_provenance, fx_rate, fx_rate_date, notes,
               CAST(NULL AS VARCHAR) AS asset_symbol, CAST(NULL AS VARCHAR) AS exchange_name
        FROM ledger.lot_history_events
        UNION ALL
        SELECT id, tax_lot_id, gain_loss_fiat, sale_price_fiat, amount_from_lot, fiat_currency,
               disposal_date, account_id, CAST(is_taxable AS INTEGER) AS is_taxable, disposal_type,
               flag, quality_flag, value_provenance, fx_rate, fx_rate_date, notes,
               asset_symbol, exchange_name
        FROM v_calculated_lot_history_events
        WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
      )
      SELECT
          i.id,
          i.tax_lot_id,
          CAST(i.disposal_date AS VARCHAR) AS disposal_date,
          CAST(i.amount_from_lot AS VARCHAR) AS amount_from_lot,
          CAST(${CONVERTED_AT_OWN_DATE('i.gain_loss_fiat')} AS VARCHAR) AS gain_loss,
          CAST(${CONVERTED_AT_OWN_DATE('i.sale_price_fiat')} AS VARCHAR) AS sale_price,
          CAST(i.gain_loss_fiat AS VARCHAR) AS native_gain_loss,
          CAST(i.sale_price_fiat AS VARCHAR) AS native_sale_price,
          i.fiat_currency,
          CAST(fx.rate AS VARCHAR) AS display_rate,
          CAST(fx.rate_date AS VARCHAR) AS display_rate_date,
          i.fiat_currency <> $2 AND fx.rate IS NULL AS unconvertible,
          i.is_taxable,
          i.disposal_type,
          i.flag,
          i.quality_flag,
          i.value_provenance,
          CAST(i.fx_rate AS VARCHAR) AS fx_rate,
          i.fx_rate_date,
          i.notes,
          i.asset_symbol,
          i.exchange_name
      FROM (
        SELECT *, ${TIMESTAMP_DAY('disposal_date')} AS own_date
        FROM events
        WHERE ${yearFilter}${accountFilter}
      ) i
      ${FX_AT_OWN_DATE}
      ORDER BY i.own_date, i.id
    `;

    const rows = (await this.db.queryMany(
      sql,
      params,
    )) as ReadonlyArray<ConvertedDisposalEventRow>;

    // A null figure never becomes a conversion outcome: the engine resolved no price for it, which
    // is not a conversion that failed. Running it through `toConvertedAmount` would report a missing
    // rate and send the user to fetch one, when what is missing is a valuation.
    const outcomeOf = (
      converted: string | null,
      native: string | null,
      row: ConvertedDisposalEventRow,
    ): ConvertedAmount | null =>
      native === null
        ? null
        : toConvertedAmount({
            amount: converted ?? native,
            nativeAmount: native,
            nativeCurrency: row.fiat_currency,
            requested: currency,
            rate: row.display_rate,
            rateDate: row.display_rate_date,
            unconvertible: row.unconvertible === true,
          });

    return rows.map((row) => ({
      id: row.id,
      taxLotId: row.tax_lot_id,
      disposalDate: row.disposal_date,
      amountFromLot: row.amount_from_lot,
      salePrice: outcomeOf(row.sale_price, row.native_sale_price, row),
      gainLoss: outcomeOf(row.gain_loss, row.native_gain_loss, row),
      isTaxable: Number(row.is_taxable) === 1,
      disposalType: row.disposal_type,
      flag: row.flag ?? null,
      qualityFlag: row.quality_flag ?? null,
      valueProvenance: row.value_provenance ?? undefined,
      fxRate: row.fx_rate,
      fxRateDate: row.fx_rate_date,
      notes: row.notes ?? undefined,
      assetSymbol: row.asset_symbol ?? undefined,
      exchangeName: row.exchange_name ?? undefined,
    }));
  }

  public async getSpanishTaxReport(
    year: number,
    accountId: string | undefined,
    displayCurrency: string,
  ): Promise<SpanishTaxBaseReport> {
    // Narrowed once, so the currency bound into every query and the currency the report states are
    // the same value. Deriving them separately is how a converted total ends up mislabelled.
    const currency: FiatCurrency = isSupportedCurrency(displayCurrency)
      ? displayCurrency
      : 'EUR';
    // Two parameter lists, because DuckDB binds positionally and refuses a list whose numbering has
    // a hole: the counting queries convert nothing, so they never mention $2 and cannot be handed it.
    const baseParams: unknown[] = [year, currency];
    const countParams: unknown[] = [year];
    let accountFilter = '';
    let countAccountFilter = '';

    if (accountId) {
      baseParams.push(accountId);
      countParams.push(accountId);
      accountFilter = ` AND account_id = $3`;
      countAccountFilter = ` AND account_id = $2`;
    }

    // $1 = year (number), $2 = display currency, $3 = accountId (string, optional)
    const savingsQuery = `
      SELECT CAST(COALESCE(SUM(${CONVERTED_AT_OWN_DATE('i.total_fiat')}), 0.0) AS VARCHAR) AS val
      FROM (
        SELECT total_fiat, fiat_currency, ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM savings_base_yields
        WHERE year = $1${accountFilter}
      ) i
      ${FX_AT_OWN_DATE}
    `;
    const generalQuery = `
      SELECT CAST(COALESCE(SUM(${CONVERTED_AT_OWN_DATE('i.total_fiat')}), 0.0) AS VARCHAR) AS val
      FROM (
        SELECT total_fiat, fiat_currency, ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM general_base_airdrops
        WHERE year = $1${accountFilter}
      ) i
      ${FX_AT_OWN_DATE}
    `;
    const disposalYear = `YEAR(${TIMESTAMP_DAY('disposal_date')})`;

    // The materialised table takes precedence; the calculated view is the fallback for a ledger that
    // has never been materialised. BOTH arms filter on `is_taxable`: the column existed on the
    // persisted rows all along and neither arm read it, so an event marked non-taxable — a
    // custody-movement fee, an unpriceable disposal — still landed in the reported tax base.
    const taxableEvents = (filter: string): string => `
      FROM (
        SELECT id, gain_loss_fiat, fiat_currency, disposal_date, account_id,
               CAST(is_taxable AS INTEGER) AS is_taxable
        FROM ledger.lot_history_events
        UNION ALL
        SELECT id, gain_loss_fiat, fiat_currency, disposal_date, account_id,
               CAST(is_taxable AS INTEGER) AS is_taxable
        FROM v_calculated_lot_history_events
        WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
      )
      WHERE (${disposalYear}) = CAST($1 AS INTEGER)${filter}
    `;

    // Each disposal converts at the rate of the day it was realised, so the base is the sum of
    // separately converted events rather than one conversion of their sum.
    const spotGainsQuery = `
      SELECT CAST(COALESCE(SUM(${CONVERTED_AT_OWN_DATE('i.gain_loss_fiat')}), 0.0) AS VARCHAR) AS val
      FROM (
        SELECT gain_loss_fiat, fiat_currency, ${TIMESTAMP_DAY('disposal_date')} AS own_date
        ${taxableEvents(accountFilter)}
          AND is_taxable = 1
      ) i
      ${FX_AT_OWN_DATE}
    `;
    /**
     * Every figure the bases are built from, in one relation, so one predicate decides which of
     * them the FX ledger cannot reach. Listing the sources separately here and converting them
     * separately above is how a source would end up in one list and not the other.
     */
    const convertibleFigures = `
        SELECT id, gain_loss_fiat AS amount, fiat_currency,
               ${TIMESTAMP_DAY('disposal_date')} AS own_date
        ${taxableEvents(accountFilter)}
          AND is_taxable = 1
        UNION ALL
        SELECT id, total_fiat AS amount, fiat_currency, ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM savings_base_yields
        WHERE year = $1${accountFilter} AND total_fiat IS NOT NULL
        UNION ALL
        SELECT id, total_fiat AS amount, fiat_currency, ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM general_base_airdrops
        WHERE year = $1${accountFilter} AND total_fiat IS NOT NULL
        UNION ALL
        SELECT id, pnl_fiat - fee_fiat AS amount, fiat_currency,
               ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM v_futures_realized_pnl
        WHERE year = $1${accountFilter}`;
    // Whether a rate was applied at all, asked of the same relation the bases are built from. Any
    // figure denominated in something other than the requested currency makes this a derivation
    // rather than a record, and the report has to say which of the two it is.
    const convertedAnythingQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) AS val
      FROM (${convertibleFigures}) i
      WHERE i.fiat_currency <> $2
    `;
    const unconvertibleQuery = `
      SELECT
          i.id,
          CAST(i.own_date AS VARCHAR) AS occurred_on,
          CAST(i.amount AS VARCHAR) AS native_amount,
          i.fiat_currency AS native_currency
      FROM (${convertibleFigures}) i
      ${FX_AT_OWN_DATE}
      WHERE i.fiat_currency <> $2 AND fx.rate IS NULL
      ORDER BY i.own_date, i.id
    `;
    const excludedEventsQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) AS val
      ${taxableEvents(countAccountFilter)}
        AND is_taxable = 0
    `;
    // `total_fiat IS NULL` is what an unresolved price leaves behind; `SUM` above already skips it,
    // so the yearly total is correct on its own — this is the count that keeps it from *looking*
    // complete when a reward the provider never priced silently dropped out of it.
    const unresolvedIncomeQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) AS val FROM (
        SELECT total_fiat FROM savings_base_yields WHERE year = $1${countAccountFilter}
        UNION ALL
        SELECT total_fiat FROM general_base_airdrops WHERE year = $1${countAccountFilter}
      )
      WHERE total_fiat IS NULL
    `;
    const futuresGainsQuery = `
      SELECT CAST(COALESCE(SUM(${CONVERTED_AT_OWN_DATE('i.net_pnl')}), 0.0) AS VARCHAR) AS val
      FROM (
        SELECT pnl_fiat - fee_fiat AS net_pnl, fiat_currency,
               ${TIMESTAMP_DAY('timestamp')} AS own_date
        FROM v_futures_realized_pnl
        WHERE year = $1${accountFilter}
      ) i
      ${FX_AT_OWN_DATE}
    `;

    const savingsRes = (await this.db.queryOne(savingsQuery, baseParams)) as {
      val: string | number;
    } | null;
    const generalRes = (await this.db.queryOne(generalQuery, baseParams)) as {
      val: string | number;
    } | null;
    const spotRes = (await this.db.queryOne(spotGainsQuery, baseParams)) as {
      val: string | number;
    } | null;
    const futuresRes = (await this.db.queryOne(
      futuresGainsQuery,
      baseParams,
    )) as { val: string | number } | null;
    const excludedRes = (await this.db.queryOne(
      excludedEventsQuery,
      countParams,
    )) as { val: string | number | bigint } | null;
    const unresolvedIncomeRes = (await this.db.queryOne(
      unresolvedIncomeQuery,
      countParams,
    )) as { val: string | number | bigint } | null;

    const unconvertibleRows = (await this.db.queryMany(
      unconvertibleQuery,
      baseParams,
    )) as ReadonlyArray<{
      id: string;
      occurred_on: string;
      native_amount: string;
      native_currency: string;
    }>;

    const convertedAnythingRes = (await this.db.queryOne(
      convertedAnythingQuery,
      baseParams,
    )) as { val: string | number | bigint } | null;

    const savingsBaseYields = new Decimal(savingsRes?.val ?? 0).toFixed(18);
    const generalBaseAirdrops = new Decimal(generalRes?.val ?? 0).toFixed(18);
    const spotCapitalGainsVal = new Decimal(spotRes?.val ?? 0).add(
      new Decimal(futuresRes?.val ?? 0),
    );

    return {
      year,
      currency,
      conversion:
        Number(convertedAnythingRes?.val ?? 0) > 0 ? { kind: 'CONVERTED' } : { kind: 'NATIVE' },
      savingsBaseYields,
      generalBaseAirdrops,
      spotCapitalGains: spotCapitalGainsVal.toFixed(18),
      excludedFlaggedEvents: Number(excludedRes?.val ?? 0),
      excludedUnresolvedIncomeCount: Number(unresolvedIncomeRes?.val ?? 0),
      unconvertibleEvents: unconvertibleRows.map((row) => ({
        id: row.id,
        occurredOn: row.occurred_on,
        nativeAmount: row.native_amount,
        nativeCurrency: row.native_currency,
      })),
    };
  }
}
