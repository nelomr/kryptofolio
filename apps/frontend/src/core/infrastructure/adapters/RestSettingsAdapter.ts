import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import { bffClient } from '@/core/infrastructure/http/BffClient';

/**
 * RestSettingsAdapter — Infrastructure adapter implementing ISettingsPort.
 * Communicates with the apps/backend /api/settings/* endpoints.
 */
export class RestSettingsAdapter implements ISettingsPort {
  async getLanguage(): Promise<string> {
    try {
      const res = await bffClient.api.settings.language.$get();
      if (!res.ok) return 'en';
      const data = await res.json();
      return (data as { language: string }).language ?? 'en';
    } catch {
      return 'en';
    }
  }

  async setLanguage(language: string): Promise<void> {
    const res = await bffClient.api.settings.language.$put({
      json: { language },
    });
    if (!res.ok) {
      throw new Error('FAILED_TO_SAVE_LANGUAGE');
    }
  }
}
