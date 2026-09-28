import { serve } from '@hono/node-server';
import { app } from './app.js';
import { container } from './core/infrastructure/di/container.js';
import { broadcastPrice } from './core/infrastructure/routes/market.js';
import { startExchangeRateBootSync } from './core/infrastructure/jobs/ExchangeRateSyncJob.js';
import { startPriceIngestionJob } from './core/infrastructure/jobs/PriceIngestionJob.js';
import { bffLogger } from './core/utils/logger.js';
import { attachServerLifecycle } from './core/infrastructure/server/serverLifecycle.js';
import { DuckDbAdapter } from '@kryptofolio/database';

export type { AppType } from './app.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      bffLogger.info('Initializing Vault SQLite Database...');
      await container.sqlitePort.initialize();
      bffLogger.info('Vault Database initialized successfully.');

      bffLogger.info('Initializing Ledger SQLite Database...');
      const ledgerStartup = await container.initializeLedgerUseCase.execute();
      bffLogger.info(
        { appliedMigrations: ledgerStartup.appliedMigrations },
        'Ledger Database initialized successfully.'
      );
      if (ledgerStartup.derivedDataInvalidated) {
        bffLogger.warn('Schema changed — derived FIFO tables flagged for rebuild.');
      }

      // Initialize the DuckDB analytical engine (FIFO views + Parquet federation)
      bffLogger.info('Initializing DuckDB Analytical Engine...');
      const duckDb = new DuckDbAdapter();
      await duckDb.initialize();
      container.setDuckDbAdapter(duckDb);
      bffLogger.info('DuckDB initialized successfully (Parquet federation active).');

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

      // Start the daily Price Ingestion Job (Parquet OHLCV)
      await startPriceIngestionJob();

      // `serve()`'s own return value must be captured — an EADDRINUSE (a stale process from a
      // previous session still holding this port, the exact recurring failure mode this fixes)
      // fires asynchronously as an `'error'` event, well outside this try/catch, so an unlistened
      // server would crash the process unhandled with no clear cause instead of exiting loudly.
      const server = serve({ fetch: app.fetch, port });
      attachServerLifecycle(server, { port, logger: bffLogger, process });
    } catch (err) {
      bffLogger.fatal({ err }, '[Bootstrap] Failed to initialize backend');
      process.exit(1);
    }
  })();
}

