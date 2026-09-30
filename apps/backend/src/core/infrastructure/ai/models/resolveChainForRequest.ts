import type { AdvisorFailureCode, ExecutionProfiles } from '@kryptofolio/shared-types';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import { resolveCredentialedChain } from './resolveCredentialedChain.js';
import { resolveExecutionProfile, type ResolvedExecutionProfile } from './resolveExecutionProfile.js';
import { readModelChain } from './resolveModelChain.js';
import type { ResolvedChainEntry } from './resolvedChainEntry.js';

export interface ResolveChainForRequestDeps {
  userSettingsPort: IUserSettingsPort;
  cryptographyPort: ICryptographyPort;
  vaultPort: IVaultCredentialsPort;
  executionProfiles?: ExecutionProfiles;
}

export type ModelChainResolution =
  | { kind: 'ready'; entries: ResolvedChainEntry[]; executionProfile: ResolvedExecutionProfile }
  | { kind: 'failed'; code: Extract<AdvisorFailureCode, 'NO_MODEL_AVAILABLE' | 'VAULT_LOCKED'> };

/**
 * The single per-request entry point for model-chain and execution-profile resolution: an unset or
 * fully-filtered chain never reaches Mastra — this function's `failed` result is checked before any
 * model call is made.
 */
export async function resolveChainForRequest(deps: ResolveChainForRequestDeps): Promise<ModelChainResolution> {
  const chain = await readModelChain(deps.userSettingsPort);
  if (chain === null) {
    return { kind: 'failed', code: 'NO_MODEL_AVAILABLE' };
  }

  const { entries, vaultLocked } = await resolveCredentialedChain(chain, deps.cryptographyPort, deps.vaultPort);
  if (entries.length === 0) {
    return { kind: 'failed', code: vaultLocked ? 'VAULT_LOCKED' : 'NO_MODEL_AVAILABLE' };
  }

  return {
    kind: 'ready',
    entries,
    executionProfile: resolveExecutionProfile(entries, deps.executionProfiles),
  };
}
