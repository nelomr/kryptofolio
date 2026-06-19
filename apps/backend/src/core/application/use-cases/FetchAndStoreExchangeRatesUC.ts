import type { IUserSettingsPort } from "../../domain/ports/IUserSettingsPort.js";
import type { IExchangeRatePort } from "../../domain/ports/IExchangeRatePort.js";
import Decimal from "decimal.js";

export class FetchAndStoreExchangeRatesUC {
  private userSettingsPort: IUserSettingsPort;
  private exchangeRatePort: IExchangeRatePort;

  constructor(
    userSettingsPort: IUserSettingsPort,
    exchangeRatePort: IExchangeRatePort,
  ) {
    this.userSettingsPort = userSettingsPort;
    this.exchangeRatePort = exchangeRatePort;
  }

  async execute(): Promise<string> {
    try {
      const rateData = await this.exchangeRatePort.getLatestRates();

      const usdRateStr = rateData.rates["USD"];
      if (!usdRateStr) {
        throw new Error("USD rate not found in exchange rate data");
      }

      const usdRate = new Decimal(usdRateStr);

      await this.userSettingsPort.setSetting(
        "exchange_rate_eur_usd",
        usdRate.toString(),
      );
      await this.userSettingsPort.setSetting(
        "exchange_rate_usd_eur",
        new Decimal(1).div(usdRate).toString(),
      );

      await this.userSettingsPort.setSetting("exchange_rate_eur_eur", "1");
      await this.userSettingsPort.setSetting("exchange_rate_usd_usd", "1");
      await this.userSettingsPort.setSetting(
        "exchange_rate_date",
        rateData.date,
      );

      return rateData.date;
    } catch (err) {
      console.error("[FetchAndStoreExchangeRatesUC] Error:", err);
      throw err;
    }
  }
}
