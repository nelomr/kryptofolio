import type { RunBudget } from '../models/resolveToolBudget.js';

/**
 * Hard runtime gate: measures a tool result's JSON encoding in characters, never tokens, so it
 * stays deterministic and free of any per-provider tokenizer dependency. The narrow-by-construction
 * `outputSchema` and top-N truncation are the first two mechanisms; this is the last-resort net for
 * the rare shape that is still over budget despite them.
 */
export type EnforceBudgetResult<T> =
  | { kind: 'ok'; payload: T }
  | { kind: 'truncated'; maxChars: number; actualChars: number };

/**
 * The run-wide cap for a local profile (`floor(contextWindow * 4 * 0.6)`, summed across one run's
 * tool results): a fresh tracker must be created per advisor run, never shared across runs or held as
 * a singleton, since two concurrent conversations must never share a running total. `consume` counts
 * every attempted tool-result size (not only delivered ones), matching the literal "running total
 * of tool-result characters in the current run" — a call that gets truncated still occupied the
 * model's attention for that step, so it still counts against the run.
 */
export interface RunBudgetTracker {
  consume(chars: number): boolean;
}

export function createRunBudgetTracker(runBudget: RunBudget): RunBudgetTracker {
  if (runBudget.kind === 'unbounded') {
    return { consume: () => true };
  }

  let used = 0;
  return {
    consume(chars) {
      used += chars;
      return used <= runBudget.maxChars;
    },
  };
}

export function enforceBudget<T>(
  payload: T,
  maxChars: number,
  runTracker?: RunBudgetTracker,
): EnforceBudgetResult<T> {
  const actualChars = JSON.stringify(payload).length;
  const withinRunBudget = runTracker ? runTracker.consume(actualChars) : true;

  if (actualChars <= maxChars && withinRunBudget) {
    return { kind: 'ok', payload };
  }

  // Names what was dropped by its size, never by re-including it — an over-budget payload must
  // never reach the model even partially through this result.
  return { kind: 'truncated', maxChars, actualChars };
}
