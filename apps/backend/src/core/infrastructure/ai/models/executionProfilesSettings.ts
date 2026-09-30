import { executionProfilesSchema, defaultExecutionProfiles, type ExecutionProfiles } from '@kryptofolio/shared-types';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

export const EXECUTION_PROFILES_SETTINGS_KEY = 'ai_advisor_execution_profiles';

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
  return executionProfilesSchema.parse(JSON.parse(raw));
}

export async function writeExecutionProfiles(
  userSettingsPort: IUserSettingsPort,
  profiles: ExecutionProfiles,
): Promise<void> {
  const validated = executionProfilesSchema.parse(profiles);
  await userSettingsPort.setSetting(EXECUTION_PROFILES_SETTINGS_KEY, JSON.stringify(validated));
}
