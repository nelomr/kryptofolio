import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import settingsApi from '../settings';
import { container } from '../../di/container';


vi.mock('../../di/container', () => ({
  container: {
    userSettingsPort: {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    },
    updateActiveMarketProviderUseCase: {
      execute: vi.fn(),
    },
  },
}));

describe('Settings API', () => {
  const app = new Hono().route('/settings', settingsApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PUT /settings/market-provider', () => {
    it('should call use case and return success', async () => {
      const res = await app.request('/settings/market-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'binance' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, providerId: 'binance' });
      expect(container.updateActiveMarketProviderUseCase.execute).toHaveBeenCalledWith('binance');
    });

    it('should return 400 for invalid body', async () => {
      const res = await app.request('/settings/market-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 123 }), // must be string
      });

      expect(res.status).toBe(400);
    });

    it('should return 500 if use case throws', async () => {
      vi.mocked(container.updateActiveMarketProviderUseCase.execute).mockRejectedValueOnce(new Error('Unknown'));

      const res = await app.request('/settings/market-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'unknown' }),
      });

      expect(res.status).toBe(500);
    });
  });
});
