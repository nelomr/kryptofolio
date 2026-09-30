import { describe, it, expect } from 'vitest';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';
import { resolveExecutionProfile } from '../resolveExecutionProfile.js';
import { resolveRunBudget, resolveToolBudget } from '../resolveToolBudget.js';
import type { ResolvedChainEntry } from '../resolvedChainEntry.js';

const profiles = defaultExecutionProfiles();

describe('resolveToolBudget', () => {
  it('looks up the fixed metered per-tool budget for a metered profile', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-a' }];
    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolveToolBudget('portfolio_summary', resolved)).toBe(4000);
    expect(resolveToolBudget('risk_metrics', resolved)).toBe(1500);
  });

  it('derives a deterministic per-tool budget for a local profile as floor(contextWindow * 4 * 0.15)', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }];
    const resolved = resolveExecutionProfile(chain, profiles);

    const expected = Math.floor(8192 * 4 * 0.15);
    expect(resolveToolBudget('portfolio_summary', resolved)).toBe(expected);
    expect(resolveToolBudget('spanish_tax_report', resolved)).toBe(expected);
    expect(resolveToolBudget('portfolio_summary', resolved)).toBe(resolveToolBudget('portfolio_summary', resolved));
  });

  it('derives the run-wide cap for a local profile as floor(contextWindow * 4 * 0.6)', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }];
    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolveRunBudget(resolved)).toEqual({ kind: 'bounded', maxChars: Math.floor(8192 * 4 * 0.6) });
  });

  it('both derived integers scale with a different declared context window', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'ollama', modelId: 'qwen3', contextWindow: 32768 }];
    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolveToolBudget('kpis', resolved)).toBe(Math.floor(32768 * 4 * 0.15));
    expect(resolveRunBudget(resolved)).toEqual({ kind: 'bounded', maxChars: Math.floor(32768 * 4 * 0.6) });
  });

  it('a metered profile has no run-wide cap — only per-tool budgets bound it', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-a' }];
    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolveRunBudget(resolved)).toEqual({ kind: 'unbounded' });
  });
});
