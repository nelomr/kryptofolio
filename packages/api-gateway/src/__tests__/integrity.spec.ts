import { describe, it, expect } from 'vitest';
import { validatePortfolioIntegrity } from '../utils/integrity.ts';
import mockPortfolio from '../data/mockPortfolio.ts';
import { MOCK_TRANSACTIONS } from '../data/mockTax.ts';

describe('Integrity validation', () => {
  const normalizedTransactions = MOCK_TRANSACTIONS.map(tx => ({
    symbol: tx.asset_in || tx.asset_out || '',
    type: tx.tx_type,
    amount: tx.amount_in || tx.amount_out || 0
  }));

  it('should return isValid true for valid data matching', () => {
    // The current mock data should perfectly match
    const report = validatePortfolioIntegrity(mockPortfolio.summary.holdings, normalizedTransactions);
    expect(report.isValid).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
  });

  it('should return isValid false and list discrepancies if there is a discrepancy', () => {
    const invalidTransactions = [
      ...normalizedTransactions,
      {
        symbol: 'BTC',
        type: 'BUY',
        amount: 10
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
