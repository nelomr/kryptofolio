/**
 * MoneyEntities — Domain Value Objects for monetary amounts and currency.
 *
 * Lives in the DOMAIN layer. NO external imports (no Decimal.js, no Zod).
 * Pure TypeScript types and factory functions.
 *
 * The actual Decimal.js arithmetic happens in the Application or Infrastructure
 * layers, which return plain Money objects.
 */

import type { FiatCurrency } from '@kryptofolio/shared-types';
import { FIAT_CURRENCY_SYMBOLS } from '@kryptofolio/shared-types';
import { Money } from '../../value-objects/Money';

export type { FiatCurrency };
export { FIAT_CURRENCY_SYMBOLS };

/**
 * FiatMoney — Immutable Value Object representing a monetary amount bound to a fiat currency.
 *
 * @example
 *   const price: FiatMoney = { amount: new Money("42000.5"), currency: 'USD' };
 */
export type FiatMoney = {
  readonly amount: Money;
  readonly currency: FiatCurrency;
};

/**
 * ExchangeRate — Immutable Value Object representing a rate between two fiat currencies.
 *
 * @example
 *   const rate: ExchangeRate = { from: 'USD', to: 'EUR', rate: new Money("0.988"), timestamp: '...' };
 */
export type ExchangeRate = {
  readonly from: FiatCurrency;
  readonly to: FiatCurrency;
  readonly rate: Money;
  readonly timestamp: string; // ISO-8601
};

/** Create a FiatMoney value object from raw primitives. */
export function createFiatMoney(amount: Money | string, currency: FiatCurrency): FiatMoney {
  return Object.freeze({
    amount: amount instanceof Money ? amount : new Money(amount),
    currency
  });
}

/** Return the currency symbol for a given FiatCurrency code. */
export function getCurrencySymbol(currency: FiatCurrency): string {
  return FIAT_CURRENCY_SYMBOLS[currency];
}
