import { serve } from '@hono/node-server';
import { app } from './app.js';
import { container } from './core/infrastructure/di/container.js';
import { broadcastPrice } from './core/infrastructure/routes/market.js';
import { startExchangeRateBootSync } from './core/infrastructure/jobs/ExchangeRateSyncJob.js';
import { bffLogger } from './core/utils/logger.js';

export type { AppType } from './app.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      bffLogger.info('Initializing Vault SQLite Database...');
      await container.sqlitePort.initialize();
      bffLogger.info('Vault Database initialized successfully.');

      bffLogger.info('Initializing Ledger SQLite Database...');
      await container.ledgerPort.initialize();
      bffLogger.info('Ledger Database initialized successfully.');

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

      // Start the Exchange Rate Boot Sync
      startExchangeRateBootSync();

      bffLogger.info(`Kryptofolio Backend running on port ${port}`);
      serve({ fetch: app.fetch, port });
    } catch (err) {
      bffLogger.fatal({ err }, '[Bootstrap] Failed to initialize backend');
      process.exit(1);
    }
  })();
}
