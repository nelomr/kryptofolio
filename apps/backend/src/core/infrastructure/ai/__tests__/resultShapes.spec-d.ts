import { describe, it, expectTypeOf } from 'vitest';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { AdvisorRunReceipt } from '../../../domain/models/AdvisorRunReceipt.js';
import type { EnforceBudgetResult } from '../tools/enforceBudget.js';

type OptionalKeysOf<T> = T extends unknown
  ? { [K in keyof T]-?: Partial<Pick<T, K>> extends Pick<T, K> ? K : never }[keyof T]
  : never;
type BooleanKeysOf<T> = T extends unknown ? { [K in keyof T]-?: boolean extends T[K] ? K : never }[keyof T] : never;

/** A member that carries a boolean flag and also an optional field: the flag-plus-optional-payload shape. */
type FlagPlusOptionalMembers<T> = T extends unknown
  ? [BooleanKeysOf<T>] extends [never]
    ? never
    : [OptionalKeysOf<T>] extends [never]
      ? never
      : T
  : never;

/**
 * Type-level only: `expectTypeOf` is erased by `vitest run`, so these assertions exist because
 * `tsc --noEmit` (the backend `typecheck` script, `include: src/**`) compiles this file.
 */
describe('result shapes are discriminated unions, never a flag plus an optional payload', () => {
  it('the detector recognises the shape it forbids', () => {
    type Bad = { kind: 'x'; truncated: boolean; payload?: string };

    expectTypeOf<FlagPlusOptionalMembers<Bad>>().toEqualTypeOf<Bad>();
  });

  it('AdvisorEvent, AdvisorRunReceipt and the truncation result each have no such member', () => {
    expectTypeOf<FlagPlusOptionalMembers<AdvisorEvent>>().toEqualTypeOf<never>();
    expectTypeOf<FlagPlusOptionalMembers<AdvisorRunReceipt>>().toEqualTypeOf<never>();
    expectTypeOf<FlagPlusOptionalMembers<EnforceBudgetResult<{ total: string }>>>().toEqualTypeOf<never>();
  });

  it('each of the three is discriminated on a literal kind', () => {
    expectTypeOf<AdvisorEvent['kind']>().toEqualTypeOf<
      'token' | 'tool-start' | 'tool-result' | 'tool-error' | 'completed' | 'refused' | 'failed'
    >();
    expectTypeOf<AdvisorRunReceipt['kind']>().toEqualTypeOf<'profiled' | 'pre-run'>();
    expectTypeOf<EnforceBudgetResult<string>['kind']>().toEqualTypeOf<'ok' | 'truncated'>();
  });

  it('a truncated result carries no payload and an ok result carries a required one', () => {
    type Result = EnforceBudgetResult<{ total: string }>;

    expectTypeOf<keyof Extract<Result, { kind: 'truncated' }>>().toEqualTypeOf<'kind' | 'maxChars' | 'actualChars'>();
    expectTypeOf<Extract<Result, { kind: 'ok' }>['payload']>().toEqualTypeOf<{ total: string }>();
  });
});
