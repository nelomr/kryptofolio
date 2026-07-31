/**
 * ledger-port-contract — Runtime shape assertions on the extended domain ports.
 *
 * The type-level contract lives in `ledger-port-contract.spec-d.ts`; `expectTypeOf` is a no-op
 * unless the file matches vitest's `typecheck.include` glob, so the two halves are kept separate
 * on purpose.
 *
 */

import { describe, it, expect } from 'vitest';
import type {
  LedgerCustodyEntry,
  ReconciliationSummary,
} from '../ILedgerPort.js';
import { toPreciseAmount } from '../../value-objects/PreciseAmount.js';

describe('LedgerCustodyEntry', () => {
  it('carries a negative delta as a precision value object, unlike fiat magnitudes', () => {
    const entry: LedgerCustodyEntry = {
      id: 'ce-1',
      tax_lot_id: 'lot-1',
      asset_id: 'XRP',
      account_id: 'acc-kraken-spot',
      qty_delta: toPreciseAmount('-179.11'),
      occurred_at: '2026-01-04T10:00:00.000Z',
      spot_transaction_id: 'tx-withdrawal',
    };
    expect(entry.qty_delta).toBe('-179.11');
  });
});

describe('ReconciliationSummary', () => {
  it('reports every reconciliation outcome, including retirement', () => {
    const summary: ReconciliationSummary = {
      inserted: 0,
      updated: 0,
      retired: 0,
      reactivated: 0,
    };
    // `retired` is the arm the UPSERT-only surface could not express, and the reason 5 orphan
    // lots survived every rebuild.
    expect(Object.keys(summary).sort()).toEqual([
      'inserted',
      'reactivated',
      'retired',
      'updated',
    ]);
  });
});
