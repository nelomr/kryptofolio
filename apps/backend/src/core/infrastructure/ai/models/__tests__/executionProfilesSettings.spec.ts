import { describe, it, expect, beforeEach } from 'vitest';
import { defaultExecutionProfiles, executionProfilesSchema, ADVISOR_TOOL_NAMES } from '@kryptofolio/shared-types';
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

  describe('a row stored before a tool name existed', () => {
    const STORED_BEFORE = ['token_lots', 'kpis'] as const;

    function storedWithout(names: readonly string[], patch: Record<string, number> = {}) {
      const defaults = defaultExecutionProfiles();
      const toolBudgets: Record<string, number> = { ...defaults.metered.toolBudgets, ...patch };
      for (const name of names) delete toolBudgets[name];
      return { ...defaults, metered: { ...defaults.metered, toolBudgets } };
    }

    it('parses and gains the missing tools at their default budgets', async () => {
      await settings.setSetting(EXECUTION_PROFILES_SETTINGS_KEY, JSON.stringify(storedWithout(STORED_BEFORE)));

      const read = await readExecutionProfiles(settings);

      expect(read.metered.toolBudgets.token_lots).toBe(defaultExecutionProfiles().metered.toolBudgets.token_lots);
      expect(read.metered.toolBudgets.kpis).toBe(defaultExecutionProfiles().metered.toolBudgets.kpis);
      expect(Object.keys(read.metered.toolBudgets).sort()).toEqual([...ADVISOR_TOOL_NAMES].sort());
    });

    it('keeps a stored override instead of replacing it with the default', async () => {
      await settings.setSetting(
        EXECUTION_PROFILES_SETTINGS_KEY,
        JSON.stringify(storedWithout(STORED_BEFORE, { portfolio_summary: 1234 })),
      );

      expect((await readExecutionProfiles(settings)).metered.toolBudgets.portfolio_summary).toBe(1234);
    });

    it('still rejects a stored row whose other fields are malformed', async () => {
      const row = storedWithout(STORED_BEFORE);
      await settings.setSetting(
        EXECUTION_PROFILES_SETTINGS_KEY,
        JSON.stringify({ ...row, metered: { ...row.metered, maxSteps: 999 } }),
      );

      await expect(readExecutionProfiles(settings)).rejects.toThrow();
    });
  });

  describe('a write that omits a tool key', () => {
    it('is rejected by the schema and leaves the stored value unchanged', async () => {
      await writeExecutionProfiles(settings, defaultExecutionProfiles());
      const before = await settings.getSetting(EXECUTION_PROFILES_SETTINGS_KEY);
      const defaults = defaultExecutionProfiles();
      const { kpis: _omitted, ...withoutKpis } = defaults.metered.toolBudgets;
      const partial = { ...defaults, metered: { ...defaults.metered, toolBudgets: withoutKpis } };

      expect(executionProfilesSchema.safeParse(partial).success).toBe(false);
      // @ts-expect-error a body missing a tool key is not an ExecutionProfiles
      await expect(writeExecutionProfiles(settings, partial)).rejects.toThrow();
      expect(await settings.getSetting(EXECUTION_PROFILES_SETTINGS_KEY)).toBe(before);
    });
  });
});
