import { Hono } from 'hono';
import { cors } from 'hono/cors';
import credentialsApi from './core/infrastructure/routes/credentials.js';
import settingsApi from './core/infrastructure/routes/settings.js';
import marketApi from './core/infrastructure/routes/market.js';
import portfolioApi from './core/infrastructure/routes/portfolio.js';
import walletsApi from './core/infrastructure/routes/wallets.js';
import taxApi from './core/infrastructure/routes/tax.js';
import metricsApi from './core/infrastructure/routes/metrics.js';
import { createIngestionApi } from './core/infrastructure/routes/ingestion.js';
import { container } from './core/infrastructure/di/container.js';

export const app = new Hono<{
  Bindings: { MODE?: string; SECRET_API_KEY?: string };
}>();

app.use('/*', cors());

const routes = app
  .basePath('/api')
  .get('/health', (c) => c.json({ status: 'ok' }, 200))
  .route('/portfolio', portfolioApi)
  .route('/wallets', walletsApi)
  .route('/tax', taxApi)
  .route('/metrics', metricsApi)
  .route('/ingestion', createIngestionApi(container))
  .route('/credentials', credentialsApi)
  .route('/settings', settingsApi)
  .route('/market', marketApi);

export type AppType = typeof routes;
