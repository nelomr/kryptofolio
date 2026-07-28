import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type {
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
    const spotGainsQuery = `
      SELECT CAST(COALESCE(SUM(CAST(gain_loss_fiat AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS val
      FROM (
        SELECT gain_loss_fiat, disposal_date, account_id FROM ledger.lot_history_events
        UNION ALL
        SELECT gain_loss_fiat, disposal_date, account_id FROM v_calculated_lot_history_events
        WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0
      )
      WHERE (
        CASE
          WHEN TRY_CAST(disposal_date AS BIGINT) IS NOT NULL AND TRY_CAST(disposal_date AS BIGINT) > 1000000000000
            THEN YEAR(EPOCH_MS(CAST(disposal_date AS BIGINT)))
          WHEN TRY_CAST(disposal_date AS BIGINT) IS NOT NULL AND TRY_CAST(disposal_date AS BIGINT) > 1000000000
            THEN YEAR(TO_TIMESTAMP(CAST(disposal_date AS BIGINT)))
          ELSE TRY_CAST(SUBSTR(CAST(disposal_date AS VARCHAR), 1, 4) AS INTEGER)
        END
      ) = CAST($1 AS INTEGER)${accountFilter}
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
    };
  }
}
