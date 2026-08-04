import { describe, it, expect } from 'vitest';
import { normalizeTransactionDirection } from '../domain/services/TransactionNormalizer';

/**
 * The row shape is `tangem_activacion_xrp.csv` verbatim:
 * `2025-06-03 10:01:00 UTC,WALLET_ACTIVATION,XRP,1.0,0.0,Tangem Base Reserve`
 */
function tangemActivationRow() {
  return normalizeTransactionDirection({
    date: '2025-06-03 10:01:00',
    tx_type: 'WALLET_ACTIVATION',
    asset: 'XRP',
    amount: '1.0',
    fee_amount: '0.0',
    metadata: { notes: 'Tangem Base Reserve' },
  }, 'UTC');
}

describe('a Tangem wallet activation is ingestible and keeps its fiscal classification', () => {
  it('resolves an acquisition-like canonical type', () => {
    expect(tangemActivationRow().tx_type).toBe('BUY');
  });

  it('carries the acquired quantity on the in-side, where an acquisition is read from', () => {
    const row = tangemActivationRow();
    expect(row.amount_in).toBe('1.0');
    expect(row.asset_in).toBe('XRP');
  });

  it('states the fiscal classification the canonical type cannot express', () => {
    expect(tangemActivationRow().fiscal_flag).toBe('WALLET_ACTIVATION');
  });

  it('leaves the classification unset for every other label', () => {
    const buy = normalizeTransactionDirection({
      date: '2025-06-03',
      tx_type: 'buy',
      asset: 'XRP',
      amount: '1.0',
      metadata: {},
    }, 'UTC');
    expect(buy.fiscal_flag).toBeUndefined();
  });
});

describe("Bitvavo's promotional credit becomes its own canonical type", () => {
  /** `Europe/Madrid,2025-09-30,10:10:36,campaign_new_user_incentive,EUR,10,…` */
  function promotionRow() {
    return normalizeTransactionDirection({
      date: '2025-09-30',
      time: '10:10:36',
      tx_type: 'campaign_new_user_incentive',
      asset: 'EUR',
      amount: '10',
      fiat_currency: 'EUR',
      metadata: {},
    }, 'UTC');
  }

  it('maps the campaign label to PROMOTION rather than leaving it unmapped', () => {
    expect(promotionRow().tx_type).toBe('PROMOTION');
  });

  it('carries the credited amount on the in-side so it can be recorded as income', () => {
    const row = promotionRow();
    expect(row.amount_in).toBe('10');
    expect(row.asset_in).toBe('EUR');
  });

  it('is not a fiscal classification: the canonical type already states what it is', () => {
    expect(promotionRow().fiscal_flag).toBeUndefined();
  });
});
