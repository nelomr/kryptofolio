import { describe, it, expect } from 'vitest';
import {
  SPOT_TX_TYPES,
  SpotTransactionSchema,
  TaxLotSchema,
  TaxLotEventSchema,
  LotCustodyEntrySchema,
} from '../../src/schemas/ledger';
import {
  FIFO_EVENT_POLICY,
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  FISCAL_CLASSIFICATION_FLAGS,
  FLAG_SEVERITY,
  MANUAL_VALUE_PROVENANCE,
  SYNTHETIC_ACCOUNT_PREFIX,
  deriveSyntheticAccountName,
  isSyntheticAccountName,
  deriveSubAccountId,
} from '../../src/schemas/fifo-policy';

describe('FIFO_EVENT_POLICY', () => {
  it('covers every canonical spot transaction type exactly, with no extras', () => {
    const policyKeys = Object.keys(FIFO_EVENT_POLICY).sort();
    const canonical = [...SPOT_TX_TYPES].sort();
    expect(policyKeys).toEqual(canonical);
  });

  it('declares no principal event for custody movements', () => {
    const custody = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'MIGRATION_SWAP'] as const;
    for (const type of custody) {
      const policy = FIFO_EVENT_POLICY[type];
      expect(policy.generatesAcquisition, `${type} must not acquire`).toBe(false);
      expect(policy.generatesDisposal, `${type} must not dispose`).toBe(false);
      expect(policy.generatesFeeDisposal, `${type} must still extract its fee`).toBe(true);
      expect(policy.taxableDisposal, `${type} principal is not taxable`).toBe(false);
    }
  });

  it('declares acquisition for BUY and disposal for SELL and SPEND', () => {
    expect(FIFO_EVENT_POLICY.BUY.generatesAcquisition).toBe(true);
    expect(FIFO_EVENT_POLICY.BUY.generatesDisposal).toBe(false);

    for (const type of ['SELL', 'SPEND'] as const) {
      expect(FIFO_EVENT_POLICY[type].generatesDisposal).toBe(true);
      expect(FIFO_EVENT_POLICY[type].taxableDisposal).toBe(true);
    }
  });

  it('declares both legs for SWAP', () => {
    expect(FIFO_EVENT_POLICY.SWAP.generatesAcquisition).toBe(true);
    expect(FIFO_EVENT_POLICY.SWAP.generatesDisposal).toBe(true);
  });

  it('declares crypto-native income as acquisition only', () => {
    for (const type of ['STAKING', 'AIRDROP', 'REWARD', 'MINING'] as const) {
      expect(FIFO_EVENT_POLICY[type].generatesAcquisition).toBe(true);
      expect(FIFO_EVENT_POLICY[type].generatesDisposal).toBe(false);
    }
  });

  it('extracts a fee disposal for every transaction type', () => {
    // A crypto fee is a disposal regardless of what the principal does. This is the invariant the
    // original implementation violated in both directions: the fee branch was ungated, while the
    // principal branch wrongly disposed of transferred amounts.
    for (const type of SPOT_TX_TYPES) {
      expect(FIFO_EVENT_POLICY[type].generatesFeeDisposal, `${type}`).toBe(true);
    }
  });
});

describe('flag vocabularies', () => {
  it('keeps data-quality and fiscal-classification vocabularies disjoint', () => {
    const overlap = FIFO_QUALITY_FLAGS.filter((f) =>
      (FISCAL_CLASSIFICATION_FLAGS as readonly string[]).includes(f)
    );
    expect(overlap).toEqual([]);
  });

  it('preserves the live WALLET_ACTIVATION fiscal classification', () => {
    expect(FISCAL_CLASSIFICATION_FLAGS).toContain('WALLET_ACTIVATION');
  });

  it('assigns a severity to every data-quality flag exactly once', () => {
    expect(Object.keys(FLAG_SEVERITY).sort()).toEqual([...FIFO_QUALITY_FLAGS].sort());
  });

  it('ranks untracked inflow and negative basis highest, custody residual lowest', () => {
    expect(FLAG_SEVERITY.UNTRACKED_INFLOW).toBe('high');
    expect(FLAG_SEVERITY.NEGATIVE_COST_BASIS).toBe('high');
    expect(FLAG_SEVERITY.CUSTODY_RESIDUAL).toBe('low');
  });

  it('exposes the disposal provenance vocabulary', () => {
    expect([...DISPOSAL_TYPES].sort()).toEqual(['FEE', 'SELL', 'SPEND', 'SWAP']);
  });

  it('exposes the manual-value provenance vocabulary', () => {
    expect([...MANUAL_VALUE_PROVENANCE].sort()).toEqual([
      'MANUAL',
      'MARKET',
      'MARKET_CONVERTED',
    ]);
  });

  it('distinguishes an absent rate from an absent price', () => {
    // The two are fixed differently — seed rates vs. seed prices — so collapsing them would send a
    // user to the wrong remedy.
    expect(FIFO_QUALITY_FLAGS).toContain('MISSING_FX_RATE');
    expect(FIFO_QUALITY_FLAGS).toContain('MISSING_PRICE');
    expect(FLAG_SEVERITY.MISSING_FX_RATE).toBe(FLAG_SEVERITY.MISSING_PRICE);
  });
});

describe('fiat magnitudes are non-negative', () => {
  it('rejects the negative total_fiat that the Kraken CSV path used to persist', () => {
    const row = {
      account_id: '5a68d802-7105-46d9-b314-8fd5fbd731f8',
      timestamp: '2025-12-15T10:00:00Z',
      tx_type: 'BUY',
      asset_in_id: 'XRP',
      amount_in: '179.11',
      // The exact value measured in the live ledger: the CSV's EUR outflow sign, preserved.
      total_fiat: '-300.00',
      price_fiat: '1.6724',
      fiat_currency: 'EUR',
    };
    expect(SpotTransactionSchema.safeParse(row).success).toBe(false);
  });

  it('accepts the same row once the sign is normalised to a magnitude', () => {
    const row = {
      account_id: '5a68d802-7105-46d9-b314-8fd5fbd731f8',
      timestamp: '2025-12-15T10:00:00Z',
      tx_type: 'BUY',
      asset_in_id: 'XRP',
      amount_in: '179.11',
      total_fiat: '300.00',
      price_fiat: '1.6724',
      fiat_currency: 'EUR',
    };
    const res = SpotTransactionSchema.safeParse(row);
    expect(res.success).toBe(true);
  });

  it('rejects a negative unit cost basis on a tax lot', () => {
    const lot = {
      spot_transaction_id: 'tx-1',
      asset_id: 'XRP',
      account_id: 'acc-1',
      original_qty: '179.11',
      remaining_qty: '179.11',
      // The derived value that turned zero-priced transfer disposals into positive gains.
      unit_cost_fiat: '-1.6724',
      total_cost_fiat: '300.00',
      fiat_currency: 'EUR',
      acquisition_timestamp: '2025-12-15T10:00:00Z',
      exchange_location: 'Kraken:spot',
      status: 'OPEN',
    };
    expect(TaxLotSchema.safeParse(lot).success).toBe(false);
  });

  it('still permits a signed custody delta, which is a genuine direction', () => {
    const entry = {
      id: 'ce-1',
      tax_lot_id: 'lot-1',
      asset_id: 'XRP',
      account_id: 'acc-kraken-spot',
      qty_delta: '-179.11',
      occurred_at: '2026-01-04T10:00:00Z',
      spot_transaction_id: 'tx-withdrawal',
    };
    expect(LotCustodyEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe('lot event flags stay in separate vocabularies', () => {
  const base = {
    tax_lot_id: 'lot-1',
    spot_transaction_id: 'tx-1',
    account_id: 'acc-1',
    disposal_date: '2026-01-04T10:00:00Z',
    amount_from_lot: '0.20',
    sale_price_fiat: null,
    gain_loss_fiat: null,
    fiat_currency: 'EUR',
    is_taxable: 0,
    disposal_type: 'FEE',
  };

  it('accepts a fiscal classification and a data-quality defect on the same event', () => {
    const res = TaxLotEventSchema.safeParse({
      ...base,
      flag: 'WALLET_ACTIVATION',
      quality_flag: 'MISSING_PRICE',
    });
    expect(res.success).toBe(true);
  });

  it('rejects a data-quality value placed in the fiscal classification field', () => {
    expect(
      TaxLotEventSchema.safeParse({ ...base, flag: 'MISSING_PRICE' }).success
    ).toBe(false);
  });

  it('rejects a fiscal classification placed in the data-quality field', () => {
    expect(
      TaxLotEventSchema.safeParse({ ...base, quality_flag: 'WALLET_ACTIVATION' }).success
    ).toBe(false);
  });

  it('requires a disposal type — provenance is never assumed', () => {
    const { disposal_type: _omitted, ...withoutType } = base;
    expect(TaxLotEventSchema.safeParse(withoutType).success).toBe(false);
  });

  it('allows a null sale price so an unknown value is not coerced to zero', () => {
    const res = TaxLotEventSchema.safeParse({ ...base, sale_price_fiat: null });
    expect(res.success).toBe(true);
  });
});

describe('deriveSyntheticAccountName', () => {
  it('normalises the asset symbol before deriving', () => {
    expect(deriveSyntheticAccountName('xrp')).toBe('ownwallet-XRP');
    expect(deriveSyntheticAccountName('XRP')).toBe('ownwallet-XRP');
    expect(deriveSyntheticAccountName('  xRp  ')).toBe('ownwallet-XRP');
  });

  it('uses the shared prefix constant', () => {
    expect(deriveSyntheticAccountName('BTC')).toBe(`${SYNTHETIC_ACCOUNT_PREFIX}BTC`);
  });

  it('rejects an empty symbol rather than producing a nameless account', () => {
    expect(() => deriveSyntheticAccountName('')).toThrow();
    expect(() => deriveSyntheticAccountName('   ')).toThrow();
  });

  it('recognises its own output', () => {
    expect(isSyntheticAccountName(deriveSyntheticAccountName('XRP'))).toBe(true);
    expect(isSyntheticAccountName('Kraken:spot')).toBe(false);
  });
});

describe('deriveSubAccountId', () => {
  it('is deterministic and stable across calls', () => {
    expect(deriveSubAccountId('Kraken', 'earn')).toBe(deriveSubAccountId('Kraken', 'earn'));
  });

  it('normalises Kraken\'s "spot / main" wallet label', () => {
    expect(deriveSubAccountId('Kraken', 'spot / main')).toBe('Kraken:spot');
  });

  it('normalises case and surrounding whitespace', () => {
    expect(deriveSubAccountId('Kraken', ' EARN ')).toBe('Kraken:earn');
  });

  it('returns the venue unchanged when no wallet is designated', () => {
    expect(deriveSubAccountId('Kraken', undefined)).toBe('Kraken');
    expect(deriveSubAccountId('Kraken', '')).toBe('Kraken');
  });

  it('rejects an empty venue', () => {
    expect(() => deriveSubAccountId('', 'earn')).toThrow();
  });
});
