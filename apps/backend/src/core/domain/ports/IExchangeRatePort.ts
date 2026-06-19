export interface IExchangeRatePort {
  /**
   * Fetches the latest exchange rates from the provider.
   * Returns an object containing the date of the rates and a map of currency to rate (relative to EUR).
   */
  getLatestRates(): Promise<{
    date: string;
    rates: Record<string, string>;
  }>;
}
