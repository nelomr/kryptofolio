import { classifyExecutionProfile, type AiProviderId } from '@kryptofolio/shared-types';

/**
 * A local `ollama` entry (never cloud-suffixed), carried through untouched — no vault lookup ever
 * applies to it.
 */
export interface ResolvedLocalChainEntry {
  providerId: 'ollama';
  modelId: string;
  contextWindow: number;
}

/**
 * Every metered entry, including an `ollama` entry whose `modelId` carries a cloud suffix — the daemon
 * holds that auth, so it carries no `apiKey` even though it is classified metered. Every
 * other provider is credentialed and carries its decrypted `apiKey`.
 */
export type ResolvedMeteredChainEntry =
  | { providerId: 'ollama'; modelId: string }
  | { providerId: Exclude<AiProviderId, 'ollama'>; modelId: string; apiKey: string };

export type ResolvedChainEntry = ResolvedLocalChainEntry | ResolvedMeteredChainEntry;

/**
 * Delegates to `classifyExecutionProfile` (shared-types) rather than re-checking `contextWindow`'s
 * presence here — a second, independent local/metered check would be a second place this project's
 * one classification rule could drift from itself.
 */
export function isLocalResolvedEntry(entry: ResolvedChainEntry): entry is ResolvedLocalChainEntry {
  return classifyExecutionProfile(entry) === 'local';
}
