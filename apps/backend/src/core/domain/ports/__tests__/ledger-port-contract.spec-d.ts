/**
 * ledger-port-contract — Type-level contract for the extended domain ports.
 *
 * The ports are the contract: an adapter must not be able to return data the port never declared,
 * and reconciliation must be expressible through the port rather than leaking into infrastructure
 * as an undeclared side effect. The original `upsertTaxLots` / `upsertLotHistoryEvents` surface was
 * structurally incapable of expressing retirement, which is why 5 orphan lots survived every
 * rebuild.
 *
 * WHY A SEPARATE `*.spec-d.ts` FILE: `expectTypeOf` compiles to nothing. Placed in an ordinary
 * `.spec.ts` it is stripped at transform time and every assertion passes vacuously. Type
 * assertions are only real when the file is picked up by `vitest --typecheck` (see
 * `typecheck.include` in `apps/backend/vitest.config.ts`) or by `tsc --noEmit`.
 *
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
  ILedgerPort,
  LedgerTaxLotEvent,
  LedgerCustodyEntry,
  LedgerManualPriceOverride,
  LedgerTransferDestinationOverride,
  ReconciliationSummary,
  EnsureAccountInput,
  EnsureAssetInput,
} from '../ILedgerPort.js';
import type { ITaxCalculatorPort, FifoDataQualityRow } from '../ITaxCalculatorPort.js';

describe('ILedgerPort reconciliation surface', () => {
  it('declares reconciliation for every derived table', () => {
    expectTypeOf<ILedgerPort>().toHaveProperty('reconcileTaxLots');
    expectTypeOf<ILedgerPort>().toHaveProperty('reconcileLotHistoryEvents');
    expectTypeOf<ILedgerPort>().toHaveProperty('reconcileCustodyEntries');
  });

  it('returns a reconciliation summary rather than void', () => {
    expectTypeOf<ILedgerPort['reconcileTaxLots']>()
      .returns.resolves.toEqualTypeOf<ReconciliationSummary>();
  });

  it('declares a unit of work so the three reconciliations can be one atomic block', () => {
    expectTypeOf<ILedgerPort>().toHaveProperty('runInTransaction');
    // The unit of work must hand back what the work produced, not swallow it into void: the
    // materialisation summary is assembled inside the transaction.
    const port = {} as ILedgerPort;
    expectTypeOf(port.runInTransaction(async () => 42)).resolves.toEqualTypeOf<number>();
  });

  it('declares CRUD for the user-authored override tables', () => {
    expectTypeOf<ILedgerPort>().toHaveProperty('getManualPriceOverrides');
    expectTypeOf<ILedgerPort>().toHaveProperty('setManualPriceOverride');
    expectTypeOf<ILedgerPort>().toHaveProperty('removeManualPriceOverride');
    expectTypeOf<ILedgerPort>().toHaveProperty('getTransferDestinationOverrides');
    expectTypeOf<ILedgerPort>().toHaveProperty('setTransferDestinationOverride');
    expectTypeOf<ILedgerPort>().toHaveProperty('removeTransferDestinationOverride');
  });

  it('accepts a venue and optional wallet so sub-accounts are expressible', () => {
    expectTypeOf<ILedgerPort['ensureAccountExists']>()
      .parameter(0)
      .toEqualTypeOf<EnsureAccountInput>();
    expectTypeOf<EnsureAccountInput>().toHaveProperty('wallet');
    expectTypeOf<EnsureAccountInput>().toHaveProperty('parentAccountId');
    expectTypeOf<EnsureAccountInput>().toHaveProperty('isSynthetic');
  });

  it('accepts the fiat classification when ensuring an asset', () => {
    expectTypeOf<ILedgerPort['ensureAssetExists']>()
      .parameter(0)
      .toEqualTypeOf<EnsureAssetInput>();
    expectTypeOf<EnsureAssetInput>().toHaveProperty('isFiat');
  });
});

describe('LedgerTaxLotEvent', () => {
  it('carries disposal provenance as a required, constrained field', () => {
    // Never `string`: an unconstrained field is how `operation_type: 'SELL'` went unnoticed.
    expectTypeOf<LedgerTaxLotEvent['disposal_type']>().toEqualTypeOf<
      'SELL' | 'SWAP' | 'FEE' | 'SPEND'
    >();
  });

  it('keeps fiscal classification and data-quality defects in separate fields', () => {
    expectTypeOf<LedgerTaxLotEvent['flag']>().toEqualTypeOf<
      'WALLET_ACTIVATION' | null | undefined
    >();
    expectTypeOf<LedgerTaxLotEvent>().toHaveProperty('quality_flag');
  });

  it('allows an unknown sale price to stay unknown', () => {
    // Non-nullable proceeds are precisely why `COALESCE(price, 1.0)` existed: the type left the
    // SQL no way to say "unresolved".
    expectTypeOf<LedgerTaxLotEvent['sale_price_fiat']>().toBeNullable();
    expectTypeOf<LedgerTaxLotEvent['gain_loss_fiat']>().toBeNullable();
  });
});

describe('LedgerCustodyEntry', () => {
  it('models a per-account signed delta against a lot', () => {
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('tax_lot_id');
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('asset_id');
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('account_id');
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('qty_delta');
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('occurred_at');
    expectTypeOf<LedgerCustodyEntry>().toHaveProperty('spot_transaction_id');
  });
});

describe('override entities', () => {
  it('keys a price override on the deterministic transaction identity', () => {
    // Keying on `id_hash` rather than the surrogate `id` is what lets an override survive a
    // re-ingestion of the same source file.
    expectTypeOf<LedgerManualPriceOverride>().toHaveProperty('id_hash');
    expectTypeOf<LedgerManualPriceOverride>().toHaveProperty('fiat_currency');
    expectTypeOf<LedgerManualPriceOverride>().toHaveProperty('price_fiat');
  });

  it('keys a destination override on the deterministic transaction identity', () => {
    expectTypeOf<LedgerTransferDestinationOverride>().toHaveProperty('id_hash');
    expectTypeOf<LedgerTransferDestinationOverride>().toHaveProperty('counterparty_account_id');
  });
});

describe('ITaxCalculatorPort', () => {
  it('declares custody entries and data-quality rows so an adapter can return them', () => {
    expectTypeOf<ITaxCalculatorPort>().toHaveProperty('calculateCustodyEntries');
    expectTypeOf<ITaxCalculatorPort>().toHaveProperty('getDataQuality');
  });

  it('types a data-quality row with a severity and a resolvable detail key', () => {
    expectTypeOf<FifoDataQualityRow>().toHaveProperty('quality_flag');
    expectTypeOf<FifoDataQualityRow>().toHaveProperty('severity');
    expectTypeOf<FifoDataQualityRow>().toHaveProperty('detail_key');
    expectTypeOf<FifoDataQualityRow>().toHaveProperty('pending_review');
  });
});
