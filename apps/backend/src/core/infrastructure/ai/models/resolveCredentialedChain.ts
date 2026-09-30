import type { ModelChain } from '@kryptofolio/shared-types';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { ResolvedChainEntry } from './resolvedChainEntry.js';

export interface CredentialedChainResolution {
  entries: ResolvedChainEntry[];
  /** Whether the vault was locked at resolution time — distinguishes `VAULT_LOCKED` from a chain
   * that simply has no credential configured. */
  vaultLocked: boolean;
}

function parseApiKey(decrypted: Buffer): string | null {
  const parsed: unknown = JSON.parse(decrypted.toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('apiKey' in parsed)) {
    return null;
  }
  const { apiKey } = parsed as { apiKey: unknown };
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return null;
  }
  return apiKey;
}

/**
 * Filters and decrypts the persisted chain per request. An `ollama` entry (local or cloud-suffixed)
 * never touches the vault. Every other entry is dropped, never contacted, when the vault is
 * locked or holds no usable credential for it — Mastra's environment-variable auto-detection is
 * never relied upon as a fallback.
 */
export async function resolveCredentialedChain(
  chain: ModelChain,
  cryptographyPort: ICryptographyPort,
  vaultPort: IVaultCredentialsPort,
): Promise<CredentialedChainResolution> {
  const vaultLocked = !cryptographyPort.isUnlocked();
  const entries: ResolvedChainEntry[] = [];

  for (const entry of chain) {
    if (entry.providerId === 'ollama') {
      entries.push(
        'contextWindow' in entry
          ? { providerId: 'ollama', modelId: entry.modelId, contextWindow: entry.contextWindow }
          : { providerId: 'ollama', modelId: entry.modelId },
      );
      continue;
    }

    if (vaultLocked) {
      continue;
    }

    const artifact = await vaultPort.getCredential(entry.providerId);
    if (!artifact) {
      continue;
    }

    const decrypted = await cryptographyPort.decrypt(artifact);
    const apiKey = parseApiKey(decrypted);
    if (!apiKey) {
      continue;
    }

    entries.push({ providerId: entry.providerId, modelId: entry.modelId, apiKey });
  }

  return { entries, vaultLocked };
}
