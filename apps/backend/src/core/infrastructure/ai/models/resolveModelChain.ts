import { isOllamaCloudModelId, modelChainSchema, type ModelChain } from '@kryptofolio/shared-types';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

export const MODEL_CHAIN_SETTINGS_KEY = 'ai_advisor_model_chain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Before cloud-suffixed ids were recognised beyond `:cloud`, a user could only keep a model like
 * `gpt-oss:120b-cloud` by declaring a `contextWindow` for it. Such a stored entry now belongs to
 * the metered shape, which forbids that field. The window only ever sized the local prompt, which
 * a cloud-proxied model has no use for, so discarding it loses nothing and keeps the rest of the
 * chain usable instead of failing validation as a whole.
 */
function dropMeaninglessCloudContextWindow(entry: unknown): unknown {
  if (
    isRecord(entry) &&
    entry.providerId === 'ollama' &&
    typeof entry.modelId === 'string' &&
    isOllamaCloudModelId(entry.modelId) &&
    'contextWindow' in entry
  ) {
    const { contextWindow: _discarded, ...rest } = entry;
    return rest;
  }
  return entry;
}

/**
 * A stored value that cannot be parsed or no longer validates is reported as "no usable chain"
 * (`null`), the same outcome as an unset chain, so the advisor fails with `NO_MODEL_AVAILABLE`
 * and the settings editor offers an empty chain to re-save, rather than either surfacing a 500.
 */
export async function readModelChain(userSettingsPort: IUserSettingsPort): Promise<ModelChain | null> {
  const raw = await userSettingsPort.getSetting(MODEL_CHAIN_SETTINGS_KEY);
  if (raw === null) {
    return null;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }

  const normalized = Array.isArray(stored) ? stored.map(dropMeaninglessCloudContextWindow) : stored;
  const parsed = modelChainSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export async function writeModelChain(userSettingsPort: IUserSettingsPort, chain: ModelChain): Promise<void> {
  const validated = modelChainSchema.parse(chain);
  await userSettingsPort.setSetting(MODEL_CHAIN_SETTINGS_KEY, JSON.stringify(validated));
}
