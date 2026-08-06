import type { IUserSettingsPort } from "../../domain/ports/IUserSettingsPort.js";
import type { IExchangeRatePort } from "../../domain/ports/IExchangeRatePort.js";
import type {
  IFxRateLedgerPort,
  DailyExchangeRate,
} from "../../domain/ports/IFxRateLedgerPort.js";
import Decimal from "decimal.js";

export interface FetchAndStoreExchangeRatesInput {
  /**
   * The date the fetch is being made for, `YYYY-MM-DD`. Defaults to today in UTC.
   *
   * Passed in rather than read from the clock inside so the carried-forward span is a function of
   * its inputs and can be asserted.
   */
  readonly asOfDate?: string;
}

/**
 * Derives the ledger rows one fetch produces: the published rate at its own date, plus one
 * carried-forward row per day between publication and `asOfDate`.
 *
 * Pure: the use case's impure edges fetch it and persist it, this decides what it is. The ECB does
 * not publish at weekends or holidays, so without the carried-forward rows a Saturday acquisition
 * would resolve no rate at all despite Friday's being the applicable one.
 */
export function deriveDailyExchangeRates(
  publicationDate: string,
  usdEurRate: string,
  asOfDate: string,
): readonly DailyExchangeRate[] {
  const rows: DailyExchangeRate[] = [
    { date: publicationDate, pair: "USD/EUR", rate: usdEurRate, source: "ECB" },
  ];

  const published = new Date(`${publicationDate}T00:00:00Z`);
  const until = new Date(`${asOfDate}T00:00:00Z`);
  const cursor = new Date(published);
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (cursor.getTime() <= until.getTime()) {
    rows.push({
      date: cursor.toISOString().slice(0, 10),
      pair: "USD/EUR",
      rate: usdEurRate,
      source: "ECB_PRIOR_DAY",
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

export class FetchAndStoreExchangeRatesUC {
  private userSettingsPort: IUserSettingsPort;
  private exchangeRatePort: IExchangeRatePort;
  private fxRateLedgerPort: IFxRateLedgerPort;

  constructor(
    userSettingsPort: IUserSettingsPort,
    exchangeRatePort: IExchangeRatePort,
    fxRateLedgerPort: IFxRateLedgerPort,
  ) {
    this.userSettingsPort = userSettingsPort;
    this.exchangeRatePort = exchangeRatePort;
    this.fxRateLedgerPort = fxRateLedgerPort;
  }

  async execute(input: FetchAndStoreExchangeRatesInput = {}): Promise<string> {
    try {
      const rateData = await this.exchangeRatePort.getLatestRates();

      const usdRateStr = rateData.rates["USD"];
      if (!usdRateStr) {
        throw new Error("USD rate not found in exchange rate data");
      }

      const usdRate = new Decimal(usdRateStr);
      // The ECB quotes EUR→USD; `exchange_rates` stores USD/EUR, i.e. EUR = USD × rate.
      const usdEur = new Decimal(1).div(usdRate);
      // The reciprocal of a 4-decimal quote is non-terminating, and Decimal's default precision emits
      // ~40 places — beyond the DECIMAL(38,18) the FIFO views multiply it into. Bounded here rather
      // than left to a CAST no reader of the ledger can see. The KV value keeps its full precision:
      // it is displayed, never multiplied into a basis.
      const usdEurLedger = usdEur.toDecimalPlaces(18).toString();

      await this.userSettingsPort.setSetting(
        "exchange_rate_eur_usd",
        usdRate.toString(),
      );
      await this.userSettingsPort.setSetting(
        "exchange_rate_usd_eur",
        usdEur.toString(),
      );

      await this.userSettingsPort.setSetting("exchange_rate_eur_eur", "1");
      await this.userSettingsPort.setSetting("exchange_rate_usd_usd", "1");
      await this.userSettingsPort.setSetting(
        "exchange_rate_date",
        rateData.date,
      );

      const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
      await this.fxRateLedgerPort.upsertDailyExchangeRates(
        deriveDailyExchangeRates(rateData.date, usdEurLedger, asOfDate),
      );

      return rateData.date;
    } catch (err) {
      console.error("[FetchAndStoreExchangeRatesUC] Error:", err);
      throw err;
    }
  }
}
