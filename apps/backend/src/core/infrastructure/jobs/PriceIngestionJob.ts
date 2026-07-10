import { container } from '../di/container.js';
import { bffLogger } from '../../utils/logger.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * PriceIngestionJob — Background scheduler for daily OHLCV price ingestion.
 *
 * Triggers IngestDailyPricesUseCase:
 *   - Once at backend startup if the last ingestion was more than 24h ago.
 *   - Then every 24 hours (midnight UTC approximation via setInterval).
 *
 * This is intentionally a simple setInterval — it does not need to be
 * cron-exact since the Use Case is idempotent (it only fetches missing dates).
 */

const LAST_RUN_SETTING_KEY = 'price_ingestion_last_run';

async function shouldRunNow(): Promise<boolean> {
  try {
    const lastRunStr = await container.userSettingsPort.getSetting(LAST_RUN_SETTING_KEY);
    if (!lastRunStr) return true; // Never ran before

    const lastRun = new Date(lastRunStr).getTime();
    const now = Date.now();
    return now - lastRun >= TWENTY_FOUR_HOURS_MS;
  } catch {
    return true; // On error, default to running
  }
}

async function runIngestion(): Promise<void> {
  bffLogger.info('[PriceIngestionJob] Starting daily price ingestion...');

  try {
    const results = await container.ingestDailyPricesUseCase.execute();

    const totalFetched = results.reduce((acc, r) => acc + r.datesFetched, 0);
    const errors = results.filter((r) => r.errors.length > 0);

    bffLogger.info(
      `[PriceIngestionJob] Ingestion complete — ${results.length} assets processed, ${totalFetched} candles fetched.`,
    );

    if (errors.length > 0) {
      bffLogger.warn(
        { errors },
        `[PriceIngestionJob] ${errors.length} asset(s) had errors during ingestion.`,
      );
    }

    // Record timestamp of last successful run
    await container.userSettingsPort.setSetting(
      LAST_RUN_SETTING_KEY,
      new Date().toISOString(),
    );
  } catch (err) {
    bffLogger.error({ err }, '[PriceIngestionJob] Fatal error during price ingestion.');
  }
}

export async function startPriceIngestionJob(): Promise<void> {
  // Boot-time run: only if data is stale (> 24h) or never ingested
  const shouldRun = await shouldRunNow();
  if (shouldRun) {
    // Fire-and-forget — do not block server startup
    void runIngestion();
  } else {
    bffLogger.info('[PriceIngestionJob] Prices are up-to-date — skipping boot ingestion.');
  }

  // Schedule daily runs every 24 hours
  setInterval(() => {
    void runIngestion();
  }, TWENTY_FOUR_HOURS_MS);
}
