import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { bffLogger } from '../../utils/logger.js';
import { container } from '../di/container.js';

const settingsApi = new Hono()
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
  )
  .get('/market-provider', async (c) => {
    try {
      const providerId = await container.userSettingsPort.getSetting('active_market_provider');
      return c.json({ providerId: providerId ?? 'kraken' });
    } catch (err) {
      bffLogger.error({ err }, 'Failed to get active market provider');
      return c.json({ providerId: 'kraken' });
    }
  })
  .put(
    '/market-provider',
    zValidator('json', z.object({ providerId: z.string().min(1) })),
    async (c) => {
      const { providerId } = c.req.valid('json');
      try {
        await container.updateActiveMarketProviderUseCase.execute(providerId);
        bffLogger.info({ providerId }, 'Active market provider updated');
        return c.json({ success: true, providerId });
      } catch (err) {
        bffLogger.error({ err }, 'Failed to update market provider setting');
        return c.json({ success: false, error: 'FAILED_TO_SAVE_MARKET_PROVIDER' }, 500);
      }
    },
  );

export default settingsApi;
