import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type { ITaxCalculatorPort, SpanishTaxBaseReport } from '../../domain/ports/ITaxCalculatorPort.js';
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

    if (accountId) {
      lotsQuery += ` WHERE account_id = '${accountId}'`;
      eventsQuery += ` WHERE account_id = '${accountId}'`;
    }

    const lots = await this.db.queryMany(lotsQuery) as TaxLotType[];
    const events = await this.db.queryMany(eventsQuery) as TaxLotEventType[];

    return { lots, events };
  }

  /**
   * Fetch Spanish IRPF tax base metrics for a specific year.
   */
  public async getSpanishTaxReport(year: number, accountId?: string): Promise<SpanishTaxBaseReport> {
    let savingsQuery = `SELECT CAST(COALESCE(SUM(total_fiat), 0.0) AS VARCHAR) AS val FROM savings_base_yields WHERE year = '${year}'`;
    let generalQuery = `SELECT CAST(COALESCE(SUM(total_fiat), 0.0) AS VARCHAR) AS val FROM general_base_airdrops WHERE year = '${year}'`;
    let spotGainsQuery = `SELECT CAST(COALESCE(SUM(CAST(gain_loss_fiat AS DECIMAL(38,18))), 0.0) AS VARCHAR) AS val FROM v_calculated_lot_history_events WHERE strftime(CAST(disposal_date AS TIMESTAMP), '%Y') = '${year}'`;
    let futuresGainsQuery = `SELECT CAST(COALESCE(SUM(pnl_fiat - fee_fiat), 0.0) AS VARCHAR) AS val FROM v_futures_realized_pnl WHERE year = '${year}'`;

    if (accountId) {
      savingsQuery += ` AND account_id = '${accountId}'`;
      generalQuery += ` AND account_id = '${accountId}'`;
      spotGainsQuery += ` AND account_id = '${accountId}'`;
      futuresGainsQuery += ` AND account_id = '${accountId}'`;
    }

    const savingsRes = await this.db.queryOne(savingsQuery) as { val: string | number } | null;
    const generalRes = await this.db.queryOne(generalQuery) as { val: string | number } | null;
    const spotRes = await this.db.queryOne(spotGainsQuery) as { val: string | number } | null;
    const futuresRes = await this.db.queryOne(futuresGainsQuery) as { val: string | number } | null;

    const savingsBaseYields = new Decimal(savingsRes?.val ?? 0).toFixed(18);
    const generalBaseAirdrops = new Decimal(generalRes?.val ?? 0).toFixed(18);
    const spotCapitalGainsVal = new Decimal(spotRes?.val ?? 0).add(new Decimal(futuresRes?.val ?? 0));

    return {
      year,
      savingsBaseYields,
      generalBaseAirdrops,
      spotCapitalGains: spotCapitalGainsVal.toFixed(18),
    };
  }
}
