import type { TaxLotType, TaxLotEventType } from '@kryptofolio/shared-types';

export interface SpanishTaxBaseReport {
  year: number;
  savingsBaseYields: string; // STAKING, EARN, DIVIDENDS
  generalBaseAirdrops: string; // AIRDROP, MINING
  spotCapitalGains: string; // Net gains from Spot FIFO
}

export interface ITaxCalculatorPort {
  /**
   * Run the vectorized FIFO algorithm inside DuckDB and return the computed
   * tax lots and lot history events.
   */
  calculateLotsAndEvents(accountId?: string): Promise<{
    lots: TaxLotType[];
    events: TaxLotEventType[];
  }>;

  /**
   * Fetch Spanish IRPF tax base metrics for a specific year.
   */
  getSpanishTaxReport(year: number, accountId?: string): Promise<SpanishTaxBaseReport>;
}
