/**
 * `ILedgerPort.{get,set,remove}SpotTransactionOverride` against the real SQLite adapter — the
 * replacement for the deleted `*ManualPriceOverride*` port surface (design.md D3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteLedgerAdapter } from '../SQLiteLedgerAdapter.js';
import type { LedgerSpotTransactionOverride } from '../../../domain/ports/ILedgerPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

function fullyUnedited(idHash: string): LedgerSpotTransactionOverride {
  return {
    id_hash: idHash,
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

describe('SQLiteLedgerAdapter — spot transaction overrides', () => {
  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    adapter = new SQLiteLedgerAdapter(db);
    await adapter.initialize();
    db.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')").run();
  });

  afterEach(() => {
    db.close();
  });

  it('returns undefined when no active override exists', async () => {
    expect(await adapter.getSpotTransactionOverride('hash-none')).toBeUndefined();
  });

  it('round-trips a price edit', async () => {
    await adapter.setSpotTransactionOverride({
      ...fullyUnedited('hash-1'),
      price_edited: true,
      price_fiat: toPreciseAmount('0.42'),
      fiat_currency: 'EUR',
    });

    const override = await adapter.getSpotTransactionOverride('hash-1');
    expect(override?.price_edited).toBe(true);
    expect(override?.price_fiat).toBe('0.42');
    expect(override?.fiat_currency).toBe('EUR');
    expect(override?.amount_in_edited).toBe(false);
  });

  it('is PUT semantics: a second write without a previously edited field reverts it to unedited', async () => {
    await adapter.setSpotTransactionOverride({
      ...fullyUnedited('hash-1'),
      price_edited: true,
      price_fiat: toPreciseAmount('0.42'),
      fiat_currency: 'EUR',
      amount_in_edited: true,
      amount_in: toPreciseAmount('2.0'),
    });

    // Second write states only the price edit — amount_in is not repeated in the payload, so it
    // must revert to unedited, not silently keep the earlier value (this is a full replacement,
    // not a merge — design.md D8).
    await adapter.setSpotTransactionOverride({
      ...fullyUnedited('hash-1'),
      price_edited: true,
      price_fiat: toPreciseAmount('0.55'),
      fiat_currency: 'EUR',
    });

    const override = await adapter.getSpotTransactionOverride('hash-1');
    expect(override?.price_fiat).toBe('0.55');
    expect(override?.amount_in_edited).toBe(false);
    expect(override?.amount_in).toBeNull();
  });

  it('accepts a CHARGED fee with an asset', async () => {
    await adapter.setSpotTransactionOverride({
      ...fullyUnedited('hash-1'),
      fee_kind: 'CHARGED',
      fee_amount: toPreciseAmount('0.001'),
      fee_asset_id: 'BTC',
    });

    const override = await adapter.getSpotTransactionOverride('hash-1');
    expect(override?.fee_kind).toBe('CHARGED');
    expect(override?.fee_amount).toBe('0.001');
    expect(override?.fee_asset_id).toBe('BTC');
  });

  it('removes (soft-deletes) an active override and reports count = 1', async () => {
    await adapter.setSpotTransactionOverride({
      ...fullyUnedited('hash-1'),
      timestamp_edited: true,
      timestamp: '2024-06-01T00:00:00.000Z',
    });

    const result = await adapter.removeSpotTransactionOverride('hash-1');
    expect(result.count).toBe(1);
    expect(await adapter.getSpotTransactionOverride('hash-1')).toBeUndefined();

    // Non-destructive: the row survives soft-deleted, not gone.
    const surviving = db
      .prepare('SELECT COUNT(*) AS count FROM spot_transaction_overrides')
      .get() as { count: number };
    expect(surviving.count).toBe(1);
  });

  it('removing a hash with no active override is a no-op reporting count = 0', async () => {
    const result = await adapter.removeSpotTransactionOverride('hash-does-not-exist');
    expect(result.count).toBe(0);
  });
});
