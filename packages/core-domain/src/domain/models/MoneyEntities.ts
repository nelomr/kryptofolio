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

export type { FiatCurrency };
export { FIAT_CURRENCY_SYMBOLS };

/**
 * Money — Immutable Value Object representing a monetary amount.
 *
 * @example
 *   const price: Money = { amount: 42000.5, currency: 'USD' };
 */
export type Money = {
  readonly amount: number;
  readonly currency: FiatCurrency;
};

/**
 * ExchangeRate — Immutable Value Object representing a rate between two fiat currencies.
 *
 * @example
 *   const rate: ExchangeRate = { from: 'USD', to: 'EUR', rate: 0.988, timestamp: '...' };
 */
export type ExchangeRate = {
  readonly from: FiatCurrency;
  readonly to: FiatCurrency;
  readonly rate: number;
  readonly timestamp: string; // ISO-8601
};

/** Create a Money value object from raw primitives. */
export function createMoney(amount: number, currency: FiatCurrency): Money {
  return Object.freeze({ amount, currency });
}

/** Return the currency symbol for a given FiatCurrency code. */
export function getCurrencySymbol(currency: FiatCurrency): string {
  return FIAT_CURRENCY_SYMBOLS[currency];
}
