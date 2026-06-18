import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import mockPortfolio from './data/mockPortfolio.js';
import {
  MOCK_TRANSACTIONS,
  MOCK_TAX_REPORT,
  MOCK_FUTURES_TRANSACTIONS,
  MOCK_FUTURES_DERIVATIVES,
} from './data/mockTax.js';
import {
  MOCK_KPIS,
  generatePerformanceHistory,
  generateDrawdownCurve,
  MOCK_ASSET_ALLOCATION,
  generateVolatilityHeatmap,
  MOCK_RISK_METRICS,
} from './data/mockMetrics.js';
import credentialsApi from './core/infrastructure/routes/credentials.js';
import settingsApi from './core/infrastructure/routes/settings.js';
import marketApi, { broadcastPrice } from './core/infrastructure/routes/market.js';
import { container } from './core/infrastructure/di/container.js';
import { MarketDataOrchestrator } from './core/application/services/MarketDataOrchestrator.js';
import { bffLogger } from './core/utils/logger.js';

export const app = new Hono<{
  Bindings: { MODE?: string; SECRET_API_KEY?: string };
}>();

app.use('/*', cors());

const routes = app
  .basePath('/api')
  .get('/health', (c) => c.json({ status: 'ok' }, 200))
  // Portfolio
  .get('/portfolio/summary', (c) => c.json(mockPortfolio.summary, 200))
  .get('/portfolio/token/:symbol', (c) => c.json({}, 200))
  .get('/portfolio/token/:symbol/history', (c) => {
    const symbol = c.req.param('symbol').toUpperCase();
    const lots = (mockPortfolio.lots as Record<string, unknown[]>)[symbol] || [];
    const history = (mockPortfolio.history as Record<string, unknown>)[symbol] || {};
    return c.json({ lots, history }, 200);
  })
  .post(
    '/portfolio/rebuild',
    zValidator('json', z.object({}).optional()),
    (c) => c.json({ success: true }, 200),
  )
  // Wallets
  .get('/wallets', (c) =>
    c.json([{ name: 'Main Kraken', type: 'EXCHANGE', chainAddresses: [] }], 200),
  )
  .post('/wallets/upload', (c) =>
    c.json([{ name: 'Imported', type: 'WALLET', chainAddresses: [] }], 200),
  )
  // Tax
  .get('/tax/transactions/spot', (c) => c.json(MOCK_TRANSACTIONS, 200))
  .get('/tax/transactions/futures', (c) => c.json(MOCK_FUTURES_TRANSACTIONS, 200))
  .get('/tax/transactions/futures-derivatives', (c) => c.json(MOCK_FUTURES_DERIVATIVES, 200))
  .get('/tax/transactions/invalid', (c) => c.json([], 200))
  .get('/tax/report', (c) => c.json(MOCK_TAX_REPORT, 200))
  .delete('/tax/transactions/:id', (c) => c.json({ success: true }, 200))
  .put('/tax/transactions/:id', zValidator('json', z.record(z.unknown())), (c) =>
    c.json({ success: true }, 200),
  )
  .post(
    '/tax/transactions/validate',
    zValidator('json', z.record(z.unknown())),
    (c) => c.json({ success: true }, 200),
  )
  .post('/tax/upload', (c) => c.json({ success: true }, 200))
  .post(
    '/tax/import',
    zValidator(
      'json',
      z.object({
        rows: z.array(z.record(z.unknown())),
        market: z.enum(['spot', 'futures']),
        timezone: z.string(),
      }),
    ),
    (c) => c.json({ success: true }, 200),
  )
  .delete('/tax/transactions/market/:market', (c) => c.json({ success: true }, 200))
  .post(
    '/tax/import-wallet',
    zValidator('json', z.object({ chain: z.string(), address: z.string() })),
    (c) => c.json({ success: true }, 200),
  )
  .post('/tax/sync-web3', zValidator('json', z.object({}).optional()), (c) =>
    c.json({ success: true }, 200),
  )
  .get('/tax/report/download', (c) => c.body('PDF content', 200))
  // Metrics
  .get('/metrics/kpis', (c) => c.json(MOCK_KPIS, 200))
  .get('/metrics/allocation', (c) => c.json(MOCK_ASSET_ALLOCATION, 200))
  .get('/metrics/performance', (c) => {
    const days = Number(c.req.query('days') || '30');
    return c.json(generatePerformanceHistory(days), 200);
  })
  .get('/metrics/heatmap', (c) => {
    const year = Number(c.req.query('year') || new Date().getFullYear());
    return c.json(generateVolatilityHeatmap(year), 200);
  })
  .get('/metrics/drawdown', (c) => {
    const days = Number(c.req.query('days') || '30');
    return c.json(generateDrawdownCurve(days), 200);
  })
  .get('/metrics/risk', (c) => c.json(MOCK_RISK_METRICS, 200))
  .get('/metrics/token/:symbol', (c) => c.json({}, 200))
  // Ingestion
  .get('/ingestion/status', (c) =>
    c.json(
      { status: 'idle', progress: 0, message: '', processedCount: 0, totalCount: 0 },
      200,
    ),
  )
  // Credentials Vault
  .route('/credentials', credentialsApi)
  // User Settings
  .route('/settings', settingsApi)
  // Market Data (SSE stream + REST)
  .route('/market', marketApi);

/**
 * AppType — The single source of truth for the Hono RPC client in apps/frontend.
 * Import this type in the frontend via: import type { AppType } from '@kryptofolio/backend'
 */
export type AppType = typeof routes;

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      bffLogger.info('Initializing Vault SQLite Database...');
      await container.sqlitePort.initialize();
      bffLogger.info('Vault Database initialized successfully.');

      // Wire the SSE broadcast callback into the MarketDataOrchestrator.
      // We do not recreate the orchestrator here to preserve DI reference equality.
      container.marketDataOrchestrator.setBroadcastCallback(broadcastPrice);

      // Automatically load the active market provider from the configuration DB
      const activeProviderId = await container.userSettingsPort.getSetting('active_market_provider');
      const providerToBoot = activeProviderId ? container.marketProviders[activeProviderId] : undefined;

      if (providerToBoot) {
        bffLogger.info(`Bootstrapping default market provider: ${activeProviderId}`);
        await container.marketDataOrchestrator.activate(providerToBoot);
      } else {
        bffLogger.warn(`No valid market provider found for ID: ${activeProviderId}`);
      }

      bffLogger.info(`Kryptofolio Backend running on port ${port}`);
      serve({ fetch: app.fetch, port });
    } catch (err) {
      bffLogger.fatal({ err }, '[Bootstrap] Failed to initialize backend');
      process.exit(1);
    }
  })();
}
