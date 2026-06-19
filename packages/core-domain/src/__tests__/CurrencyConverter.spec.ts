import { describe, it, expect } from 'vitest';
import { CurrencyConverter } from '../application/CurrencyConverter';
import { createMoney } from '../domain/models/MoneyEntities';
import type { ExchangeRate } from '../domain/models/MoneyEntities';

const USD_EUR_RATE: ExchangeRate = {
  from: 'USD',
  to: 'EUR',
  rate: 0.988,
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('CurrencyConverter', () => {
  describe('convert()', () => {
    it('converts USD to EUR correctly using Decimal.js', () => {
      const moneyUsd = createMoney(100, 'USD');
      const result = CurrencyConverter.convert(moneyUsd, USD_EUR_RATE);
      expect(result.currency).toBe('EUR');
      expect(result.amount).toBeCloseTo(98.8, 5);
    });

    it('handles large BTC prices without floating point drift', () => {
      const btcUsd = createMoney(42000.5, 'USD');
      const result = CurrencyConverter.convert(btcUsd, USD_EUR_RATE);
      // 42000.5 * 0.988 = 41496.494 — must NOT drift
      expect(result.amount).toBeCloseTo(41496.494, 3);
      expect(result.currency).toBe('EUR');
    });

    it('throws when money currency does not match rate.from', () => {
      const moneyEur = createMoney(100, 'EUR');
      expect(() => CurrencyConverter.convert(moneyEur, USD_EUR_RATE)).toThrow(
        /Currency mismatch/i
      );
    });

    it('returns a frozen (immutable) Money object', () => {
      const moneyUsd = createMoney(100, 'USD');
      const result = CurrencyConverter.convert(moneyUsd, USD_EUR_RATE);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('formatRateLabel()', () => {
    it('formats rate label correctly', () => {
      const label = CurrencyConverter.formatRateLabel(USD_EUR_RATE);
      expect(label).toBe('USD/EUR = 0.9880');
    });
  });
});
