import type { AssetPrice } from "@kryptofolio/shared-types";
import type { IUserSettingsPort } from "../../domain/ports/IUserSettingsPort";
import { CurrencyConverter } from "@kryptofolio/core-domain";
import type { Money, ExchangeRate } from "@kryptofolio/core-domain";
import Decimal from 'decimal.js';

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

    // Try to fetch the exchange rate
    // E.g., if rawPrice is USD and base is EUR, we need exchange_rate_usd_eur
    const rateStr = await this.userSettingsPort.getSetting(
      `exchange_rate_${rawPrice.currency.toLowerCase()}_${baseCurrency.toLowerCase()}`,
    );

    if (!rateStr) {
      return rawPrice; // Fallback to raw if no rate is available
    }

    const rate: ExchangeRate = {
      from: rawPrice.currency as any,
      to: baseCurrency as any,
      rate: new Decimal(rateStr).toNumber(),
      timestamp: new Date().toISOString(),
    };

    const money: Money = {
      amount: rawPrice.price,
      currency: rawPrice.currency as any,
    };

    const converted = CurrencyConverter.convert(money, rate);

    return {
      ...rawPrice,
      price: converted.amount,
      currency: converted.currency,
    };
  }
}
