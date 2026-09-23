/**
 * fifo-chain-state — Type-level contract for freshness as a discriminated union (design D6).
 *
 * WHY A SEPARATE `*.spec-d.ts` FILE: `expectTypeOf` and `@ts-expect-error` compile to nothing
 * in an ordinary `.spec.ts` — stripped at transform time, every assertion passes vacuously.
 * They are only real when the file is picked up by `tsc --noEmit` (see `typecheck.include` in
 * `apps/backend/vitest.config.ts`, and the root `pnpm --filter @kryptofolio/backend typecheck`).
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { FifoChainState, FreshChain, FifoBuildId } from '../FifoChainState.js';

describe('FifoChainState', () => {
  it('is discriminated on kind', () => {
    expectTypeOf<FifoChainState['kind']>().toEqualTypeOf<'fresh' | 'stale' | 'rebuilding'>();
  });

  it('reaches buildId and builtAt only through the fresh variant', () => {
    expectTypeOf<FreshChain>().toEqualTypeOf<
      Extract<FifoChainState, { kind: 'fresh' }>
    >();
    expectTypeOf<FreshChain>().toHaveProperty('buildId');
    expectTypeOf<FreshChain>().toHaveProperty('builtAt');
    expectTypeOf<FreshChain['buildId']>().toEqualTypeOf<FifoBuildId>();
  });

  it('rejects a fresh variant without a buildId', () => {
    // @ts-expect-error — `fresh` without a `buildId` must not typecheck (rule 5: no
    // boolean-plus-optional-payload shape; the field must be reachable only when it means something)
    const bad: FifoChainState = { kind: 'fresh' };
    void bad;
  });

  it('rejects a stale variant carrying a buildId', () => {
    // @ts-expect-error — `stale` with a `buildId` must not typecheck
    const bad: FifoChainState = { kind: 'stale', reason: 'never-built', buildId: 'x' as FifoBuildId };
    void bad;
  });
});
