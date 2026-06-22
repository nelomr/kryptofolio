import { describe, it, expect } from 'vitest';
import { CurrencyConverter } from '../application/CurrencyConverter';
import { createFiatMoney } from '../domain/models/MoneyEntities';
import type { ExchangeRate } from '../domain/models/MoneyEntities';
import { Money } from '../value-objects/Money';

const USD_EUR_RATE: ExchangeRate = {
  from: 'USD',
  to: 'EUR',
  rate: new Money("0.988"),
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('CurrencyConverter', () => {
  describe('convert()', () => {
    it('converts USD to EUR correctly using Decimal.js', () => {
      const moneyUsd = createFiatMoney("100", 'USD');
      const result = CurrencyConverter.convert(moneyUsd, USD_EUR_RATE);
      expect(result.currency).toBe('EUR');
      expect(result.amount.toString()).toBe("98.8");
    });

    it('handles large BTC prices without floating point drift', () => {
      const btcUsd = createFiatMoney("42000.5", 'USD');
      const result = CurrencyConverter.convert(btcUsd, USD_EUR_RATE);
      // 42000.5 * 0.988 = 41496.494 — must NOT drift
      expect(result.amount.toString()).toBe("41496.494");
      expect(result.currency).toBe('EUR');
    });

    it('throws when money currency does not match rate.from', () => {
      const moneyEur = createFiatMoney("100", 'EUR');
      expect(() => CurrencyConverter.convert(moneyEur, USD_EUR_RATE)).toThrow(
        /Currency mismatch/i
      );
    });

    it('returns a frozen (immutable) Money object', () => {
      const moneyUsd = createFiatMoney("100", 'USD');
      const result = CurrencyConverter.convert(moneyUsd, USD_EUR_RATE);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('formatRateLabel()', () => {
    it('formats rate label correctly', () => {
      const label = CurrencyConverter.formatRateLabel(USD_EUR_RATE);
      expect(label).toBe('USD/EUR = 0.988');
    });
  });
});
