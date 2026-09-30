import { deriveLocalRunBudget, deriveLocalToolBudget, type AdvisorToolName } from '@kryptofolio/shared-types';
import type { ResolvedExecutionProfile } from './resolveExecutionProfile.js';

/**
 * Metered budgets are the fixed, user-editable per-tool table; local budgets are never
 * stored — they are derived at request time from the resolved chain entry's declared
 * `contextWindow`, so the real constraint and the number used cannot drift from each other.
 */
export function resolveToolBudget(toolName: AdvisorToolName, profile: ResolvedExecutionProfile): number {
  if (profile.kind === 'local') {
    return deriveLocalToolBudget(profile.contextWindow);
  }
  return profile.settings.toolBudgets[toolName];
}

/**
 * A run-wide cap is only defined for a local profile — a metered run has no run-wide char budget,
 * only per-tool ones, since each call is already individually bounded. `{ kind: 'unbounded' }` makes
 * that absence a value the caller must handle, rather than a sentinel number a stray comparison could
 * treat as a real limit.
 */
export type RunBudget = { kind: 'bounded'; maxChars: number } | { kind: 'unbounded' };

export function resolveRunBudget(profile: ResolvedExecutionProfile): RunBudget {
  if (profile.kind === 'local') {
    return { kind: 'bounded', maxChars: deriveLocalRunBudget(profile.contextWindow) };
  }
  return { kind: 'unbounded' };
}
