import { describe, it, expect, vi } from 'vitest';

const ollamaFactory = vi.fn((modelId: string) => ({ __ollamaModelId: modelId }));
const createOllamaMock = vi.fn(() => ollamaFactory);

vi.mock('ollama-ai-provider-v2', () => ({ createOllama: createOllamaMock }));

const { buildModelChainConfig } = await import('../buildModelChainConfig.js');

describe('buildModelChainConfig', () => {
  it('resolves an ollama entry to a createOllama({ baseURL }) model instance', () => {
    const config = buildModelChainConfig([{ providerId: 'ollama', modelId: 'llama3.1', contextWindow: 8192 }]);

    expect(createOllamaMock).toHaveBeenCalledWith({ baseURL: expect.any(String) });
    expect(config).toEqual([
      {
        kind: 'local-daemon',
        model: { __ollamaModelId: 'llama3.1' },
        maxRetries: 1,
        providerOptions: { ollama: { options: { num_ctx: 8192 } } },
      },
    ]);
  });

  it('resolves an ollama-cloud entry to a router-config entry carrying its apiKey', () => {
    const config = buildModelChainConfig([
      { providerId: 'ollama-cloud', modelId: 'qwen3-cloud', apiKey: 'sk-cloud-key' },
    ]);

    expect(config).toEqual([
      { kind: 'router', model: { id: 'ollama-cloud/qwen3-cloud', apiKey: 'sk-cloud-key' }, maxRetries: 2 },
    ]);
  });

  it.each(['qwen3:cloud', 'gpt-oss:120b-cloud'])(
    'serves an ollama entry with cloud id %s through the local daemon, metered and without num_ctx',
    (modelId) => {
      createOllamaMock.mockClear();
      const config = buildModelChainConfig([{ providerId: 'ollama', modelId }], 'http://daemon.test/api');

      expect(createOllamaMock).toHaveBeenCalledWith({ baseURL: 'http://daemon.test/api' });
      expect(config).toEqual([{ kind: 'cloud-daemon', model: { __ollamaModelId: modelId }, maxRetries: 2 }]);
      expect(config[0]).not.toHaveProperty('providerOptions');
    },
  );

  it('resolves a plain metered entry (e.g. openai) to a router-config entry', () => {
    const config = buildModelChainConfig([{ providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-real' }]);

    expect(config).toEqual([{ kind: 'router', model: { id: 'openai/gpt-4o-mini', apiKey: 'sk-real' }, maxRetries: 2 }]);
  });
});
