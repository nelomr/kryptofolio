import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { bffLogger } from '../utils/logger.ts';
import { container } from '../core/infrastructure/di/container.ts';

type Env = { Bindings: { MODE?: string; SECRET_API_KEY?: string; PROD_API_URL?: string } };

const settingsApi = new Hono<Env>()
  .get('/language', async (c) => {
    try {
      const lang = await container.userSettingsPort.getSetting('language');
      return c.json({ language: lang ?? 'en' });
    } catch (err) {
      bffLogger.error({ err }, 'Failed to get language setting');
      return c.json({ language: 'en' });
    }
  })
  .put(
    '/language',
    // We allow any valid locale string format (e.g., 'en', 'es-ES').
    // The frontend use case is responsible for guaranteeing the locale exists.
    zValidator('json', z.object({ language: z.string().min(2).max(10) })),
    async (c) => {
      const { language } = c.req.valid('json');
      try {
        await container.userSettingsPort.setSetting('language', language);
        bffLogger.info({ language }, 'Language setting updated');
        return c.json({ success: true, language });
      } catch (err) {
        bffLogger.error({ err }, 'Failed to update language setting');
        return c.json({ success: false, error: 'FAILED_TO_SAVE_LANGUAGE' }, 500);
      }
    },
  );

export default settingsApi;
