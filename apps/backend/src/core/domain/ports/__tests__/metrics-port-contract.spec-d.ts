import { describe, it, expectTypeOf } from 'vitest';
import type { PreciseAmount } from '../../value-objects/PreciseAmount.js';
import type { PerformanceHistoryPoint } from '../IMetricsPort.js';

describe('PerformanceHistoryPoint', () => {
  it('models an unconvertible point as a null portfolioValue', () => {
    expectTypeOf<PerformanceHistoryPoint['portfolioValue']>().toEqualTypeOf<PreciseAmount | null>();
  });
});
