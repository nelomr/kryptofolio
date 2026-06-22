import type { FiatMoney, ExchangeRate, FiatCurrency } from '../domain/models/MoneyEntities';
import { createFiatMoney } from '../domain/models/MoneyEntities';

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
   * Convert a FiatMoney value object from one currency to another using an ExchangeRate.
   *
   * @param money     - The source monetary amount.
   * @param rate      - The exchange rate to apply.
   * @returns         A new FiatMoney value object in the target currency.
   * @throws          If the rate's `from` currency doesn't match the money's currency.
   *
   * @example
   *   const btcInUsd: FiatMoney = createFiatMoney("42000", 'USD');
   *   const usdEurRate: ExchangeRate = { from: 'USD', to: 'EUR', rate: new Money("0.988"), timestamp: '...' };
   *   const btcInEur = CurrencyConverter.convert(btcInUsd, usdEurRate);
   *   // btcInEur => { amount: Money("41496"), currency: 'EUR' }
   */
  static convert(money: FiatMoney, rate: ExchangeRate): FiatMoney {
    if (money.currency !== rate.from) {
      throw new Error(
        `[CurrencyConverter] Currency mismatch: money is in ${money.currency} but rate converts from ${rate.from}`
      );
    }

    const converted = money.amount.mul(rate.rate);

    return createFiatMoney(converted, rate.to as FiatCurrency);
  }

  /**
   * Format an exchange rate for display purposes.
   *
   * @example
   *   CurrencyConverter.formatRateLabel({ from: 'USD', to: 'EUR', rate: 0.9880, timestamp: '...' })
   *   // => 'USD/EUR = 0.9880'
   */
  static formatRateLabel(rate: ExchangeRate): string {
    const formatted = rate.rate.toString(); // Just use toString for now, or format it
    return `${rate.from}/${rate.to} = ${formatted}`;
  }
}
