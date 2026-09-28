/**
 * `canRetype` enforces design.md D4: a `tx_type` edit must never cross the custody boundary — it
 * can never turn an internal transfer into a taxable disposal, nor a non-transfer row into a
 * transfer leg, because transfer pairing (`transfer_group_id`, `ownwallet-<ASSET>`) is not an
 * editable field (rule 6).
 *
 * TASK 3.1 DEVIATION: tasks.md describes this as "a failing `packages/core-domain` test", but 3.2
 * places the implementation in `apps/backend/src/core/domain/` (matching every other pure domain
 * helper in this backend — see `services/FxCoverage.ts` and `__tests__/no-new-money-boundary.spec.ts`
 * in this same directory). The test lives beside the implementation it tests, per that existing
 * pattern; `packages/core-domain` is unrelated to this backend-only concern.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canRetype } from '../SpotTransactionOverridePolicy.js';

describe('SpotTransactionOverridePolicy: no id_hash recomputation', () => {
  it('the module imports no hash service, and calls no id-hash-shaped function', () => {
    const file = path.join(import.meta.dirname, '..', 'SpotTransactionOverridePolicy.ts');
    const source = fs.readFileSync(file, 'utf-8');
    expect(source).not.toMatch(/generateIdHash|TransactionHashService/);
  });

  it('imports nothing from packages/core-domain (no SQL, no Zod, no I/O — pure domain)', () => {
    const file = path.join(import.meta.dirname, '..', 'SpotTransactionOverridePolicy.ts');
    const source = fs.readFileSync(file, 'utf-8');
    expect(source).not.toMatch(/from\s+['"]zod['"]|from\s+['"]decimal\.js['"]|@kryptofolio\/core-domain/);
  });
});

describe('canRetype', () => {
  it('rejects retyping a TRANSFER_OUT row that has a transfer_group_id', () => {
    expect(canRetype('TRANSFER_OUT', 'SELL', 'tg-1')).toBe(false);
  });

  it('rejects retyping a custody-movement row (e.g. DEPOSIT) even without a transfer_group_id', () => {
    expect(canRetype('DEPOSIT', 'BUY', null)).toBe(false);
  });

  it('rejects retyping SELL into TRANSFER_IN — a non-transfer row cannot become a transfer', () => {
    expect(canRetype('SELL', 'TRANSFER_IN', null)).toBe(false);
  });

  it('rejects retyping BUY into TRANSFER_OUT', () => {
    expect(canRetype('BUY', 'TRANSFER_OUT', null)).toBe(false);
  });

  it('allows BUY -> SWAP, a reclassification among non-custody types', () => {
    expect(canRetype('BUY', 'SWAP', null)).toBe(true);
  });

  it('allows REWARD -> AIRDROP', () => {
    expect(canRetype('REWARD', 'AIRDROP', null)).toBe(true);
  });

  it('allows retyping to the same type (a no-op reclassification)', () => {
    expect(canRetype('BUY', 'BUY', null)).toBe(true);
  });
});
