/**
 * Real defect found in production (post-implementation manual testing): `GET /tax/transactions/spot`
 * flagged an edited row with `override.kind === 'ACTIVE'` but always displayed the ORIGINAL imported
 * values — the Ledgers table showed the "edited" badge without ever showing the edited figures, and
 * a page reload never surfaced them either, because the row the route returned never carried them.
 *
 * `toEffectiveSpotTransaction` is the pure per-field merge that was missing: for each editable field,
 * show the override's value when that field's flag is set, otherwise the original.
 */
import { describe, it, expect } from 'vitest';
import {
  toEffectiveSpotTransaction,
  withOverrideView,
  editedFieldsOf,
  type SpotTransactionOverrideView,
} from '../EffectiveSpotTransactionView';
import type { LedgerSpotTransaction, LedgerSpotTransactionOverride } from '../../ports/ILedgerPort';

function baseTx(overrides: Partial<LedgerSpotTransaction> = {}): LedgerSpotTransaction {
  return {
    id: 'tx-1',
    id_hash: 'hash-1',
    account_id: 'acc-1',
    tx_type: 'BUY',
    asset_in_id: 'XRP',
    amount_in: '100' as LedgerSpotTransaction['amount_in'],
    fee_asset_id: 'EUR',
    fee_amount: '1' as LedgerSpotTransaction['fee_amount'],
    total_fiat: '150' as LedgerSpotTransaction['total_fiat'],
    price_fiat: '1.5' as LedgerSpotTransaction['price_fiat'],
    fiat_currency: 'EUR',
    timestamp: '2025-01-01T00:00:00.000Z',
    status: 'COMPLETED',
    ...overrides,
  } as LedgerSpotTransaction;
}

function noOverride(id_hash: string): LedgerSpotTransactionOverride {
  return {
    id_hash,
    amount_in_edited: false,
    amount_in: null,
    amount_out_edited: false,
    amount_out: null,
    price_edited: false,
    price_fiat: null,
    fiat_currency: null,
    total_fiat_edited: false,
    total_fiat: null,
    fee_kind: 'UNCHANGED',
    fee_amount: null,
    fee_asset_id: null,
    timestamp_edited: false,
    timestamp: null,
    tx_type_edited: false,
    tx_type: null,
  };
}

describe('toEffectiveSpotTransaction', () => {
  it('shows the overridden price and total, not the original, when only price/total are edited', () => {
    const tx = baseTx();
    const override: LedgerSpotTransactionOverride = {
      ...noOverride('hash-1'),
      price_edited: true,
      price_fiat: '2' as LedgerSpotTransaction['price_fiat'],
      fiat_currency: 'EUR',
      total_fiat_edited: true,
      total_fiat: '200' as LedgerSpotTransaction['total_fiat'],
    };

    const effective = toEffectiveSpotTransaction(tx, override);

    expect(effective.price_fiat).toBe('2');
    expect(effective.total_fiat).toBe('200');
    // Untouched fields must still come from the original row.
    expect(effective.amount_in).toBe('100');
  });

  it('applies a CHARGED fee override (amount + asset), overriding both original fee fields', () => {
    const tx = baseTx();
    const override: LedgerSpotTransactionOverride = {
      ...noOverride('hash-1'),
      fee_kind: 'CHARGED',
      fee_amount: '5' as NonNullable<LedgerSpotTransaction['fee_amount']>,
      fee_asset_id: 'BTC',
    };

    const effective = toEffectiveSpotTransaction(tx, override);

    expect(effective.fee_amount).toBe('5');
    expect(effective.fee_asset_id).toBe('BTC');
  });

  it('applies a NONE fee override as no fee at all, distinct from a stated 0', () => {
    const tx = baseTx();
    const override: LedgerSpotTransactionOverride = { ...noOverride('hash-1'), fee_kind: 'NONE' };

    const effective = toEffectiveSpotTransaction(tx, override);

    expect(effective.fee_amount).toBeUndefined();
    expect(effective.fee_asset_id).toBeUndefined();
  });

  it('returns the original row untouched when there is no active override', () => {
    const tx = baseTx();

    const effective = toEffectiveSpotTransaction(tx, null);

    expect(effective).toEqual(tx);
  });

  it('never lets an edit change identity/routing fields even if an override happened to carry them', () => {
    const tx = baseTx({ id: 'tx-1', id_hash: 'hash-1', account_id: 'acc-1' });
    const override: LedgerSpotTransactionOverride = {
      ...noOverride('hash-1'),
      timestamp_edited: true,
      timestamp: '2025-06-01T00:00:00.000Z',
    };

    const effective = toEffectiveSpotTransaction(tx, override);

    expect(effective.id).toBe('tx-1');
    expect(effective.id_hash).toBe('hash-1');
    expect(effective.account_id).toBe('acc-1');
    expect(effective.timestamp).toBe('2025-06-01T00:00:00.000Z');
  });
});

describe('editedFieldsOf', () => {
  it('lists exactly the fields whose flag is set, and the fee whenever it is not UNCHANGED', () => {
    expect(editedFieldsOf(noOverride('h'))).toEqual([]);
    expect(
      editedFieldsOf({
        ...noOverride('h'),
        amount_in_edited: true,
        price_edited: true,
        fee_kind: 'NONE',
        tx_type_edited: true,
      }),
    ).toEqual(['amount_in', 'price_fiat', 'fee', 'tx_type']);
  });
});

describe('withOverrideView', () => {
  it('marks an untouched row NONE and carries its original values', () => {
    const tx = baseTx();

    const [row] = withOverrideView([tx], []);

    expect(row?.override).toEqual<SpotTransactionOverrideView>({ kind: 'NONE' });
    expect(row?.price_fiat).toBe('1.5');
  });

  it('shows effective values on an edited row and keeps the pre-edit row under override.original', () => {
    const tx = baseTx();
    const override: LedgerSpotTransactionOverride = {
      ...noOverride('hash-1'),
      tx_type_edited: true,
      tx_type: 'SELL',
    };

    const [row] = withOverrideView([tx], [override]);

    expect(row?.tx_type).toBe('SELL');
    expect(row?.override).toEqual({ kind: 'ACTIVE', original: tx, editedFields: ['tx_type'] });
  });

  it('keeps an explicit zero fee as a charged zero instead of collapsing it into no fee', () => {
    const tx = baseTx();
    const override: LedgerSpotTransactionOverride = {
      ...noOverride('hash-1'),
      fee_kind: 'CHARGED',
      fee_amount: '0' as NonNullable<LedgerSpotTransaction['fee_amount']>,
      fee_asset_id: 'EUR',
    };

    const [row] = withOverrideView([tx], [override]);

    expect(row?.fee_amount).toBe('0');
    expect(row?.fee_asset_id).toBe('EUR');
    expect(row?.override).toMatchObject({ kind: 'ACTIVE', editedFields: ['fee'] });
  });
});
