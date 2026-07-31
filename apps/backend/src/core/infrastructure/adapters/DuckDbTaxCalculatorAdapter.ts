import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
  CustodyEntryRow,
  FifoDataQualityRow,
  ITaxCalculatorPort,
  SpanishTaxBaseReport,
} from '../../domain/ports/ITaxCalculatorPort.js';
import type { TaxLotType, TaxLotEventType } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';

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

  public async getSpanishTaxReport(
    year: number,
    accountId?: string,
  ): Promise<SpanishTaxBaseReport> {
    const baseParams: unknown[] = [year];
    let accountFilter = '';

    if (accountId) {
      baseParams.push(accountId);
      accountFilter = ` AND account_id = $2`;
    }

    // $1 = year (number), $2 = accountId (string, optional)
    const savingsQuery = `
      SELECT CAST(COALESCE(SUM(total_fiat), 0.0) AS VARCHAR) AS val
      FROM savings_base_yields
      WHERE year = $1${accountFilter}
    `;
    const generalQuery = `
      SELECT CAST(COALESCE(SUM(total_fiat), 0.0) AS VARCHAR) AS val
      FROM general_base_airdrops
      WHERE year = $1${accountFilter}
    `;
    // `disposal_date` has been written as an ISO string, as epoch seconds and as epoch
    // milliseconds by different ingestion paths, so the year is derived rather than substring-ed.
    const disposalYear = `
        CASE
          WHEN TRY_CAST(disposal_date AS BIGINT) IS NOT NULL AND TRY_CAST(disposal_date AS BIGINT) > 1000000000000
            THEN YEAR(EPOCH_MS(CAST(disposal_date AS BIGINT)))
          WHEN TRY_CAST(disposal_date AS BIGINT) IS NOT NULL AND TRY_CAST(disposal_date AS BIGINT) > 1000000000
            THEN YEAR(TO_TIMESTAMP(CAST(disposal_date AS BIGINT)))
          ELSE TRY_CAST(SUBSTR(CAST(disposal_date AS VARCHAR), 1, 4) AS INTEGER)
        END`;

    // The materialised table takes precedence; the calculated view is the fallback for a ledger that
    // has never been materialised. BOTH arms filter on `is_taxable`: the column existed on the
    // persisted rows all along and neither arm read it, so an event marked non-taxable — a
    // custody-movement fee, an unpriceable disposal — still landed in the reported tax base.
    const taxableEvents = `
      FROM (
        SELECT gain_loss_fiat, disposal_date, account_id, CAST(is_taxable AS INTEGER) AS is_taxable
        FROM ledger.lot_history_events
        UNION ALL
        SELECT gain_loss_fiat, disposal_date, account_id, CAST(is_taxable AS INTEGER) AS is_taxable
        FROM v_calculated_lot_history_events
        WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
      )
      WHERE (${disposalYear}) = CAST($1 AS INTEGER)${accountFilter}
    `;

    const spotGainsQuery = `
      SELECT CAST(COALESCE(SUM(CAST(gain_loss_fiat AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS val
      ${taxableEvents}
        AND is_taxable = 1
    `;
    const excludedEventsQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) AS val
      ${taxableEvents}
        AND is_taxable = 0
    `;
    const futuresGainsQuery = `
      SELECT CAST(COALESCE(SUM(pnl_fiat - fee_fiat), 0.0) AS VARCHAR) AS val
      FROM v_futures_realized_pnl
      WHERE year = $1${accountFilter}
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
      baseParams,
    )) as { val: string | number | bigint } | null;

    const savingsBaseYields = new Decimal(savingsRes?.val ?? 0).toFixed(18);
    const generalBaseAirdrops = new Decimal(generalRes?.val ?? 0).toFixed(18);
    const spotCapitalGainsVal = new Decimal(spotRes?.val ?? 0).add(
      new Decimal(futuresRes?.val ?? 0),
    );

    return {
      year,
      savingsBaseYields,
      generalBaseAirdrops,
      spotCapitalGains: spotCapitalGainsVal.toFixed(18),
      excludedFlaggedEvents: Number(excludedRes?.val ?? 0),
    };
  }
}
