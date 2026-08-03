import type { AssetPrice } from "@kryptofolio/shared-types";
import { isSupportedCurrency } from "@kryptofolio/shared-types";
import type { IUserSettingsPort } from "../../domain/ports/IUserSettingsPort";
import { CurrencyConverter } from "@kryptofolio/core-domain";
import type { FiatMoney, ExchangeRate } from "@kryptofolio/core-domain";
import { Money } from "@kryptofolio/core-domain";

/**
 * StreamNormalizedMarketDataUC
 *
 * Intercepts raw market prices (e.g. USD) and normalizes them to the user's
 * configured base currency before yielding.
 */
export class StreamNormalizedMarketDataUC {
  private userSettingsPort: IUserSettingsPort;

  constructor(userSettingsPort: IUserSettingsPort) {
    this.userSettingsPort = userSettingsPort;
  }

  async execute(rawPrice: AssetPrice): Promise<AssetPrice> {
    const baseCurrency =
      (await this.userSettingsPort.getSetting("base_currency")) || "USD";

    if (rawPrice.currency === baseCurrency) {
      return rawPrice;
    }

    // Converting a code the money model cannot represent would yield an amount labelled with a
    // currency that has no definition, which is worse than leaving the price in its source currency.
    if (!isSupportedCurrency(rawPrice.currency) || !isSupportedCurrency(baseCurrency)) {
      return rawPrice;
    }

    // Try to fetch the exchange rate
    // E.g., if rawPrice is USD and base is EUR, we need exchange_rate_usd_eur
    const rateStr = await this.userSettingsPort.getSetting(
      `exchange_rate_${rawPrice.currency.toLowerCase()}_${baseCurrency.toLowerCase()}`,
    );

    if (!rateStr) {
      return rawPrice; // Fallback to raw if no rate is available
    }

    const rate: ExchangeRate = {
      from: rawPrice.currency,
      to: baseCurrency,
      rate: new Money(rateStr),
      timestamp: new Date().toISOString(),
    };

    const money: FiatMoney = {
      amount: new Money(rawPrice.price),
      currency: rawPrice.currency,
    };

    const converted = CurrencyConverter.convert(money, rate);

    return {
      ...rawPrice,
      price: converted.amount.toString(),
      currency: converted.currency,
    };
  }
}
