import { describe, it, expect } from 'vitest';
import { validatePortfolioIntegrity } from '../utils/integrity';
import mockPortfolio from '../data/mockPortfolio';
import { MOCK_TRANSACTIONS } from '../data/mockTax';

describe('Integrity validation', () => {
  it('should return isValid true for valid data matching', () => {
    // The current mock data should perfectly match
    const report = validatePortfolioIntegrity(mockPortfolio.summary.holdings, MOCK_TRANSACTIONS);
    expect(report.isValid).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
  });

  it('should return isValid false and list discrepancies if there is a discrepancy', () => {
    const invalidTransactions = [
      ...MOCK_TRANSACTIONS,
      {
        id: 'tx-extra',
        type: 'BUY',
        symbol: 'BTC',
        amount: 10,
        totalEur: 100,
        priceEur: 10,
        feeEur: 0,
        timestamp: '2025-01-01T00:00:00Z',
        exchange: 'Kraken'
      }
    ];
    
    const report = validatePortfolioIntegrity(mockPortfolio.summary.holdings, invalidTransactions);
    expect(report.isValid).toBe(false);
    expect(report.discrepancies.length).toBeGreaterThan(0);
    expect(report.discrepancies[0].symbol).toBe('BTC');
    // BTC holding will have 10 less than the tx balances (due to the extra BUY)
    expect(report.discrepancies[0].delta).toBe(-10);
  });
});
