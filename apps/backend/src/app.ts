import { Hono } from 'hono';
import { cors } from 'hono/cors';
import credentialsApi from './core/infrastructure/routes/credentials.js';
import settingsApi from './core/infrastructure/routes/settings.js';
import marketApi from './core/infrastructure/routes/market.js';
import walletsApi from './core/infrastructure/routes/wallets.js';
import { createPortfolioApi } from './core/infrastructure/routes/portfolio.js';
import { createTaxApi } from './core/infrastructure/routes/tax.js';
import { createMetricsApi } from './core/infrastructure/routes/metrics.js';
import { createIngestionApi } from './core/infrastructure/routes/ingestion.js';
import { createFiscalApi } from './core/infrastructure/routes/fiscal.js';
import { createAdvisorApi, type AdvisorRouteDeps } from './core/infrastructure/routes/advisor.js';
import { container } from './core/infrastructure/di/container.js';

export const app = new Hono<{
  Bindings: { MODE?: string; SECRET_API_KEY?: string };
}>();

app.use('/*', cors());

// Every field is read when a request arrives, never at import: resolving `container.askAdvisorUC`
// here would open the advisor database and the ledger for any process that merely imports `app`.
const advisorRouteDeps: AdvisorRouteDeps = {
  askAdvisorUC: { execute: (input) => container.askAdvisorUC.execute(input) },
  get userSettingsPort() {
    return container.userSettingsPort;
  },
  get vaultCredentialsPort() {
    return container.vaultCredentialsPort;
  },
  get cryptographyPort() {
    return container.cryptographyPort;
  },
};

const routes = app
  .basePath('/api')
  .get('/health', (c) => c.json({ status: 'ok' }, 200))
  .route('/portfolio', createPortfolioApi(container))
  .route('/wallets', walletsApi)
  .route('/tax', createTaxApi(container))
  .route('/metrics', createMetricsApi(container))
  .route('/ingestion', createIngestionApi(container))
  .route('/fiscal', createFiscalApi(container))
  .route('/credentials', credentialsApi)
  .route('/settings', settingsApi)
  .route('/market', marketApi)
  .route('/advisor', createAdvisorApi(advisorRouteDeps));

export type AppType = typeof routes;
