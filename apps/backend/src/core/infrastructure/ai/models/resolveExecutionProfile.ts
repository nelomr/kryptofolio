import {
  defaultExecutionProfiles,
  type ExecutionProfiles,
  type ExecutionProfileSettings,
  type MeteredExecutionProfileSettings,
  type RunExecutionProfile,
} from '@kryptofolio/shared-types';
import { isLocalResolvedEntry, type ResolvedChainEntry } from './resolvedChainEntry.js';

/**
 * `kind`-discriminated rather than a shared shape with an optional `contextWindow` — a local run
 * always has one and a metered run never does, so a boolean-plus-optional-payload shape here would
 * let "kind: local, no contextWindow" exist as a representable-but-meaningless state.
 */
export type ResolvedExecutionProfile =
  | {
      runProfile: 'local';
      kind: 'local';
      settings: ExecutionProfileSettings;
      contextWindow: number;
    }
  | {
      runProfile: Exclude<RunExecutionProfile, 'local'>;
      kind: 'metered';
      settings: MeteredExecutionProfileSettings;
    };

/**
 * An all-local resolved chain runs under the local profile. Every other case — all-metered or
 * a local/metered mix — runs under the metered profile, with `runProfile` distinguishing an
 * actually-mixed chain (`mixed`) from a chain that was purely metered by configuration (`metered`).
 */
export function resolveExecutionProfile(
  resolvedChain: ResolvedChainEntry[],
  profiles: ExecutionProfiles = defaultExecutionProfiles(),
): ResolvedExecutionProfile {
  const allLocal = resolvedChain.length > 0 && resolvedChain.every(isLocalResolvedEntry);
  if (allLocal) {
    const contextWindows = resolvedChain
      .map((entry) => (isLocalResolvedEntry(entry) ? entry.contextWindow : undefined))
      .filter((contextWindow): contextWindow is number => contextWindow !== undefined);
    const contextWindow = Math.min(...contextWindows);
    return { runProfile: 'local', kind: 'local', settings: profiles.local, contextWindow };
  }

  const allMetered = resolvedChain.every((entry) => !isLocalResolvedEntry(entry));
  return {
    runProfile: allMetered ? 'metered' : 'mixed',
    kind: 'metered',
    settings: profiles.metered,
  };
}
