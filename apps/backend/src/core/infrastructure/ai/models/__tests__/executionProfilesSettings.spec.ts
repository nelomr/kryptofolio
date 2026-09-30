import { describe, it, expect, beforeEach } from 'vitest';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import {
  EXECUTION_PROFILES_SETTINGS_KEY,
  readExecutionProfiles,
  writeExecutionProfiles,
} from '../executionProfilesSettings.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

/**
 * Unlike the model chain (`null` on unset, a real failure), an unset execution-profiles key
 * resolves to the code defaults — needed by `MastraAdvisorAdapter` so every request
 * has real limits even before a user ever visits Settings.
 */
describe('executionProfilesSettings', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
  });

  it('resolves the code defaults when unset', async () => {
    expect(await readExecutionProfiles(settings)).toEqual(defaultExecutionProfiles());
  });

  it('writes under the ai_advisor_execution_profiles key, validated', async () => {
    const edited = { ...defaultExecutionProfiles(), metered: { ...defaultExecutionProfiles().metered, maxSteps: 8 } };
    await writeExecutionProfiles(settings, edited);

    const raw = await settings.getSetting(EXECUTION_PROFILES_SETTINGS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).metered.maxSteps).toBe(8);
  });

  it('resolves the edited value on the very next read', async () => {
    const edited = { ...defaultExecutionProfiles(), local: { ...defaultExecutionProfiles().local, lastMessages: 77 } };
    await writeExecutionProfiles(settings, edited);

    expect((await readExecutionProfiles(settings)).local.lastMessages).toBe(77);
  });

  it('rejects a persisted value exceeding a schema ceiling instead of silently clamping it', async () => {
    await settings.setSetting(
      EXECUTION_PROFILES_SETTINGS_KEY,
      JSON.stringify({ ...defaultExecutionProfiles(), metered: { ...defaultExecutionProfiles().metered, maxSteps: 999 } }),
    );

    await expect(readExecutionProfiles(settings)).rejects.toThrow();
  });
});
