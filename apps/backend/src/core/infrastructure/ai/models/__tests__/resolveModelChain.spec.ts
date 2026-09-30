import { describe, it, expect, beforeEach } from 'vitest';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import { MODEL_CHAIN_SETTINGS_KEY, readModelChain, writeModelChain } from '../resolveModelChain.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe('resolveModelChain', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
  });

  it('returns null when no chain has ever been persisted', async () => {
    expect(await readModelChain(settings)).toBeNull();
  });

  it('writes the chain under the ai_advisor_model_chain settings key, validated', async () => {
    await writeModelChain(settings, [{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);

    const raw = await settings.getSetting(MODEL_CHAIN_SETTINGS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual([
      { providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 },
    ]);
  });

  it('resolves the chain that was just written, on the same call path used per request', async () => {
    await writeModelChain(settings, [{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);

    expect(await readModelChain(settings)).toEqual([{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);
  });

  it('takes effect on the very next resolution, without a restart, when the chain changes between two requests', async () => {
    await writeModelChain(settings, [{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);
    const first = await readModelChain(settings);

    await writeModelChain(settings, [{ providerId: 'anthropic', modelId: 'claude-3-5-sonnet' }]);
    const second = await readModelChain(settings);

    expect(first).toEqual([{ providerId: 'openai', modelId: 'gpt-4o-mini' }]);
    expect(second).toEqual([{ providerId: 'anthropic', modelId: 'claude-3-5-sonnet' }]);
  });

  it('drops the meaningless contextWindow of a stored cloud-suffixed ollama entry instead of discarding the chain', async () => {
    await settings.setSetting(
      MODEL_CHAIN_SETTINGS_KEY,
      JSON.stringify([
        { providerId: 'ollama', modelId: 'gpt-oss:120b-cloud', contextWindow: 8192 },
        { providerId: 'ollama', modelId: 'qwen3:cloud', contextWindow: 4096 },
        { providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 },
      ]),
    );

    expect(await readModelChain(settings)).toEqual([
      { providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' },
      { providerId: 'ollama', modelId: 'qwen3:cloud' },
      { providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 },
    ]);
  });

  it('does not normalize away a contextWindow on a non-ollama entry, which stays invalid', async () => {
    await settings.setSetting(
      MODEL_CHAIN_SETTINGS_KEY,
      JSON.stringify([{ providerId: 'openai', modelId: 'gpt-x-cloud', contextWindow: 8192 }]),
    );

    expect(await readModelChain(settings)).toBeNull();
  });

  it.each([
    ['a schema-invalid value', JSON.stringify([{ providerId: 'ollama' }])],
    ['a non-array value', JSON.stringify({ providerId: 'openai' })],
    ['unparseable JSON', '{not json'],
  ])('treats %s as no usable chain instead of throwing', async (_label, raw) => {
    await settings.setSetting(MODEL_CHAIN_SETTINGS_KEY, raw);

    expect(await readModelChain(settings)).toBeNull();
  });
});
