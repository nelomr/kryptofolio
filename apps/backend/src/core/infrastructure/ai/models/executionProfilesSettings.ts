import { z } from 'zod';
import { executionProfilesSchema, defaultExecutionProfiles, type ExecutionProfiles } from '@kryptofolio/shared-types';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

export const EXECUTION_PROFILES_SETTINGS_KEY = 'ai_advisor_execution_profiles';

const storedRowSchema = z
  .object({
    metered: z.object({ toolBudgets: z.record(z.string(), z.unknown()) }).passthrough(),
  })
  .passthrough();

/**
 * Lays the stored tool budgets over the defaults, so a row saved before a tool existed gains that
 * tool at its default instead of failing strict validation. Only `toolBudgets` is merged: every
 * other stored field stays required, so a corrupted row is still rejected rather than patched.
 */
function mergeStoredOverDefaults(stored: unknown): unknown {
  const shape = storedRowSchema.safeParse(stored);
  if (!shape.success) return stored;
  const defaults = defaultExecutionProfiles();
  return {
    ...shape.data,
    metered: {
      ...shape.data.metered,
      toolBudgets: { ...defaults.metered.toolBudgets, ...shape.data.metered.toolBudgets },
    },
  };
}

/**
 * Unlike `readModelChain` (`null` on unset, since an unset chain is a real failure),
 * an unset execution-profiles key resolves to the code defaults — the limits always exist,
 * whether or not the user has ever edited them.
 */
export async function readExecutionProfiles(userSettingsPort: IUserSettingsPort): Promise<ExecutionProfiles> {
  const raw = await userSettingsPort.getSetting(EXECUTION_PROFILES_SETTINGS_KEY);
  if (raw === null) {
    return defaultExecutionProfiles();
  }
  return executionProfilesSchema.parse(mergeStoredOverDefaults(JSON.parse(raw)));
}

export async function writeExecutionProfiles(
  userSettingsPort: IUserSettingsPort,
  profiles: ExecutionProfiles,
): Promise<void> {
  const validated = executionProfilesSchema.parse(profiles);
  await userSettingsPort.setSetting(EXECUTION_PROFILES_SETTINGS_KEY, JSON.stringify(validated));
}
