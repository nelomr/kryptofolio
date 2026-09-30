import { describe, it, expect } from 'vitest';
import { deriveLocalToolBudget, deriveLocalRunBudget } from '../../src/advisor-stream';

describe('local budgets derived from the declared context window', () => {
  it('derives the per-tool budget as a fraction of the window measured in characters', () => {
    expect(deriveLocalToolBudget(8192)).toBe(4915);
    expect(deriveLocalToolBudget(32768)).toBe(19660);
  });

  it('derives the run-wide budget as a larger fraction of the same window', () => {
    expect(deriveLocalRunBudget(8192)).toBe(19660);
    expect(deriveLocalRunBudget(32768)).toBe(78643);
  });

  it('always yields whole characters', () => {
    expect(Number.isInteger(deriveLocalToolBudget(1001))).toBe(true);
    expect(Number.isInteger(deriveLocalRunBudget(1001))).toBe(true);
  });
});
