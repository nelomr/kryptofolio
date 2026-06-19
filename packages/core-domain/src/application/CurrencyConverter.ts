import Decimal from 'decimal.js';
import type { Money, ExchangeRate, FiatCurrency } from '../domain/models/MoneyEntities';
import { createMoney } from '../domain/models/MoneyEntities';

/**
 * CurrencyConverter — Application-layer currency conversion service.
 *
 * Lives in the APPLICATION layer (not Domain) because it imports `decimal.js`.
 * Keeps Domain layer pure — no external deps in domain/models.
 *
 * Uses Decimal.js for all arithmetic to avoid IEEE-754 floating point errors.
 */
export class CurrencyConverter {
  /**
   * Convert a Money value object from one currency to another using an ExchangeRate.
   *
   * @param money     - The source monetary amount.
   * @param rate      - The exchange rate to apply.
   * @returns         A new Money value object in the target currency.
   * @throws          If the rate's `from` currency doesn't match the money's currency.
   *
   * @example
   *   const btcInUsd: Money = createMoney(42000, 'USD');
   *   const usdEurRate: ExchangeRate = { from: 'USD', to: 'EUR', rate: 0.988, timestamp: '...' };
   *   const btcInEur = CurrencyConverter.convert(btcInUsd, usdEurRate);
   *   // btcInEur => { amount: 41496, currency: 'EUR' }
   */
  static convert(money: Money, rate: ExchangeRate): Money {
    if (money.currency !== rate.from) {
      throw new Error(
        `[CurrencyConverter] Currency mismatch: money is in ${money.currency} but rate converts from ${rate.from}`
      );
    }

    const converted = new Decimal(money.amount)
      .mul(new Decimal(rate.rate))
      .toDecimalPlaces(8);

    return createMoney(converted.toNumber(), rate.to as FiatCurrency);
  }

  /**
   * Format an exchange rate for display purposes.
   *
   * @example
   *   CurrencyConverter.formatRateLabel({ from: 'USD', to: 'EUR', rate: 0.9880, timestamp: '...' })
   *   // => 'USD/EUR = 0.9880'
   */
  static formatRateLabel(rate: ExchangeRate): string {
    const formatted = new Decimal(rate.rate).toFixed(4);
    return `${rate.from}/${rate.to} = ${formatted}`;
  }
}
