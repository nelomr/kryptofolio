import { describe, it, expect } from 'vitest';
import { ADVISOR_TOOL_NAMES, defaultExecutionProfiles } from '../../src/advisor-stream';

describe('default metered tool budgets', () => {
  it('give every advisor tool a positive integer budget, so a new name cannot ship without one', () => {
    const { toolBudgets } = defaultExecutionProfiles().metered;
    for (const name of ADVISOR_TOOL_NAMES) {
      expect(Number.isInteger(toolBudgets[name]), name).toBe(true);
      expect(toolBudgets[name], name).toBeGreaterThan(0);
    }
  });
});
