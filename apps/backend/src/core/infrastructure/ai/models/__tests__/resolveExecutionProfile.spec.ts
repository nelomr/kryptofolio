import { describe, it, expect } from 'vitest';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';
import { resolveExecutionProfile } from '../resolveExecutionProfile.js';
import type { ResolvedChainEntry } from '../resolvedChainEntry.js';

const profiles = defaultExecutionProfiles();

describe('resolveExecutionProfile', () => {
  it('resolves the local profile for an all-local resolved chain', () => {
    const chain: ResolvedChainEntry[] = [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }];

    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolved.runProfile).toBe('local');
    expect(resolved.kind).toBe('local');
    expect(resolved.settings).toEqual(profiles.local);
    expect(resolved.settings.maxSteps).toBe(15);
  });

  it('resolves the metered profile, run-profile "metered", for an all-metered chain', () => {
    const chain: ResolvedChainEntry[] = [
      { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-a' },
      { providerId: 'anthropic', modelId: 'claude-3-5-sonnet', apiKey: 'sk-b' },
    ];

    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolved.runProfile).toBe('metered');
    expect(resolved.kind).toBe('metered');
    expect(resolved.settings).toEqual(profiles.metered);
  });

  it('resolves the metered profile but run-profile "mixed" for a chain mixing local and metered entries', () => {
    const chain: ResolvedChainEntry[] = [
      { providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 },
      { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-a' },
    ];

    const resolved = resolveExecutionProfile(chain, profiles);

    expect(resolved.runProfile).toBe('mixed');
    expect(resolved.kind).toBe('metered');
    expect(resolved.settings).toEqual(profiles.metered);
  });
});
