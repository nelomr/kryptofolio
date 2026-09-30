import { createOllama } from 'ollama-ai-provider-v2';
import type { MastraModelConfig } from '@mastra/core/llm';
import { isLocalResolvedEntry, type ResolvedChainEntry } from './resolvedChainEntry.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/api';

/** A model that never leaves the machine: the daemon serves it, with its declared context window. */
export interface LocalDaemonModelChainConfigEntry {
  kind: 'local-daemon';
  model: MastraModelConfig;
  maxRetries: 1;
  providerOptions: { ollama: { options: { num_ctx: number } } };
}

/**
 * A cloud-suffixed `ollama` model: the signed-in daemon proxies it to ollama.com, so it needs no
 * API key, but it is metered. It declares no context window, so it carries no `num_ctx`.
 */
export interface CloudDaemonModelChainConfigEntry {
  kind: 'cloud-daemon';
  model: MastraModelConfig;
  maxRetries: 2;
}

export interface RouterModelChainConfigEntry {
  kind: 'router';
  /** `id` is Mastra's own `` `${string}/${string}` `` router-id template (`OpenAICompatibleConfig`)
   * — narrower than plain `string`, which is what actually makes this
   * shape assignable to `ModelWithRetries[]` when building a fallback array. */
  model: { id: `${string}/${string}`; apiKey: string };
  maxRetries: 2;
}

export type ModelChainConfigEntry =
  | LocalDaemonModelChainConfigEntry
  | CloudDaemonModelChainConfigEntry
  | RouterModelChainConfigEntry;

/**
 * Maps a filtered, credentialed chain onto Mastra's dynamic fallback-array shape. Every `ollama`
 * entry goes through `createOllama({ baseURL })`, local or cloud-suffixed: Mastra's provider
 * registry has no plain `ollama` provider, so a `ollama/<model>` router id cannot resolve. Only the
 * credentialed providers, `ollama-cloud` included, use the router with their vault API key.
 */
export function buildModelChainConfig(
  resolvedChain: ResolvedChainEntry[],
  baseURL: string = DEFAULT_OLLAMA_BASE_URL,
): ModelChainConfigEntry[] {
  return resolvedChain.map((entry): ModelChainConfigEntry => {
    if (isLocalResolvedEntry(entry)) {
      return {
        kind: 'local-daemon',
        model: createOllama({ baseURL })(entry.modelId),
        maxRetries: 1,
        providerOptions: { ollama: { options: { num_ctx: entry.contextWindow } } },
      };
    }

    if (entry.providerId === 'ollama') {
      return { kind: 'cloud-daemon', model: createOllama({ baseURL })(entry.modelId), maxRetries: 2 };
    }

    return {
      kind: 'router',
      model: { id: `${entry.providerId}/${entry.modelId}`, apiKey: entry.apiKey },
      maxRetries: 2,
    };
  });
}
