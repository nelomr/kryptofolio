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
    exchangeRatePort: {
      getLatestRates: vi.fn().mockResolvedValue({
        date: '2026-06-19',
        rates: { USD: '1.05' }
      }),
    },
    fxRateLedgerPort: {
      upsertDailyExchangeRates: vi.fn().mockResolvedValue(1),
    },
    updateActiveMarketProviderUseCase: {
      execute: vi.fn(),
    },
    ledgerPort: {
      getAccounts: vi.fn(),
      ensureAccountExists: vi.fn(),
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

  describe('base currency', () => {
    it('persists the selected currency through the settings port', async () => {
      // The save path had no test at all: the selector could round-trip through the UI while the
      // value never reached storage, and every downstream read would silently fall back to USD.
      const res = await app.request('/settings/base-currency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseCurrency: 'EUR' }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, baseCurrency: 'EUR' });
      expect(container.userSettingsPort.setSetting).toHaveBeenCalledWith('base_currency', 'EUR');
    });

    it('reads back the currency that was stored', async () => {
      vi.mocked(container.userSettingsPort.getSetting).mockResolvedValue('EUR');

      const res = await app.request('/settings/base-currency');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ baseCurrency: 'EUR' });
    });

    it('falls back to USD only when nothing is stored', async () => {
      // A default is correct here, but it must be reached by absence rather than by a failure to read
      // what is present — otherwise a stored EUR could report as USD and be filed as one.
      vi.mocked(container.userSettingsPort.getSetting).mockResolvedValue(null);

      const res = await app.request('/settings/base-currency');

      expect(await res.json()).toEqual({ baseCurrency: 'USD' });
    });

    it('refuses a currency outside the supported set instead of storing it', async () => {
      // The port narrows on read, but a rejected write is what keeps an unserviceable code out of
      // storage in the first place — nothing downstream can convert into it.
      const res = await app.request('/settings/base-currency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseCurrency: 'XAU' }),
      });

      expect(res.status).toBe(400);
      expect(container.userSettingsPort.setSetting).not.toHaveBeenCalled();
    });
  });

  describe('POST /settings/exchange-rate/sync', () => {
    it('should call FetchAndStoreExchangeRatesUC and return success', async () => {

      const res = await app.request('/settings/exchange-rate/sync', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });

  describe('GET /settings/exchange-rate/:key', () => {
    it('should return rate as string and date if found', async () => {
      vi.mocked(container.userSettingsPort.getSetting).mockImplementation(async (k) => {
        if (k === 'exchange_rate_usd_eur') return '0.9237';
        if (k === 'exchange_rate_date') return '2026-06-19';
        return null;
      });

      const res = await app.request('/settings/exchange-rate/usd_eur');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ key: 'usd_eur', rate: '0.9237', date: '2026-06-19' });
    });

    it('should return null rate and date if not found', async () => {
      vi.mocked(container.userSettingsPort.getSetting).mockResolvedValue(null);

      const res = await app.request('/settings/exchange-rate/usd_eur');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ key: 'usd_eur', rate: null, date: null });
    });
  });

  describe('GET /settings/accounts', () => {
    const LEDGER_ACCOUNTS = [
      { id: 'kraken', name: 'Kraken', type: 'exchange', parentAccountId: null, isSynthetic: false },
      { id: 'kraken:earn', name: 'Kraken / earn', type: 'exchange', parentAccountId: 'kraken', isSynthetic: false },
      { id: 'ownwallet-XRP', name: 'Own Wallet XRP', type: 'wallet', parentAccountId: null, isSynthetic: true },
    ];

    it('omits synthetic accounts, which are custody counterparties and not selectable', async () => {
      vi.mocked(container.ledgerPort.getAccounts).mockResolvedValue(LEDGER_ACCOUNTS);

      const res = await app.request('/settings/accounts');
      const body = await res.json() as { accounts: { value: string }[] };

      expect(res.status).toBe(200);
      expect(body.accounts.map((a) => a.value)).not.toContain('ownwallet-XRP');
      expect(body.accounts).toHaveLength(2);
    });

    it('carries the parent account id so a sub-wallet can render under its venue', async () => {
      vi.mocked(container.ledgerPort.getAccounts).mockResolvedValue(LEDGER_ACCOUNTS);

      const res = await app.request('/settings/accounts');
      const body = await res.json() as {
        accounts: { value: string; label: string; type: string; parentAccountId: string | null }[];
      };

      expect(body.accounts).toEqual([
        { value: 'kraken', label: 'Kraken', type: 'exchange', parentAccountId: null },
        { value: 'kraken:earn', label: 'Kraken / earn', type: 'exchange', parentAccountId: 'kraken' },
      ]);
    });

    it('reports a read failure instead of presenting an empty account list as the truth', async () => {
      vi.mocked(container.ledgerPort.getAccounts).mockRejectedValueOnce(new Error('ledger unavailable'));

      const res = await app.request('/settings/accounts');

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: 'FAILED_TO_READ_ACCOUNTS' });
    });
  });
});
