import { describe, it, expect } from 'vitest';
import { txSearchInputSchema } from '../../src/advisor-tx-search';

describe('tx_search input', () => {
  it('accepts no filter at all and defaults to the first page', () => {
    expect(txSearchInputSchema.parse({})).toEqual({ page: 1 });
  });

  it('upper-cases the symbol and keeps valid filters', () => {
    expect(
      txSearchInputSchema.parse({ symbol: 'eth', from: '2024-01-01', to: '2024-12-31', types: ['BUY', 'SELL'], page: 2 }),
    ).toEqual({ symbol: 'ETH', from: '2024-01-01', to: '2024-12-31', types: ['BUY', 'SELL'], page: 2 });
  });

  it('rejects an empty types array and a type outside the spot enum', () => {
    expect(txSearchInputSchema.safeParse({ types: [] }).success).toBe(false);
    expect(txSearchInputSchema.safeParse({ types: ['GIFT'] }).success).toBe(false);
  });

  it('rejects a page below one or a fractional page', () => {
    for (const page of [0, -1, 1.5]) expect(txSearchInputSchema.safeParse({ page }).success, String(page)).toBe(false);
  });

  it('rejects dates that are not calendar days', () => {
    for (const bad of ['2024-1-1', '2024-13-01', '2024-02-30', 'yesterday', '2024-01-01T00:00:00Z']) {
      expect(txSearchInputSchema.safeParse({ from: bad }).success, bad).toBe(false);
    }
  });

  it('rejects an account id, a currency and any other unknown key', () => {
    for (const key of ['accountId', 'currency', 'limit']) {
      expect(txSearchInputSchema.safeParse({ [key]: 'x' }).success, key).toBe(false);
    }
  });
});
