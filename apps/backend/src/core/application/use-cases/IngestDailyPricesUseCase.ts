import type { ILedgerPort } from '../../domain/ports/ILedgerPort.js';
import type { IPriceIngestionPort } from '../../domain/ports/IPriceIngestionPort.js';
import type { IHistoricalMarketDataPort } from '../../domain/ports/IHistoricalMarketDataPort.js';
import type { IngestionResult } from '../../domain/ports/IPriceIngestionPort.js';

/**
 * IngestDailyPricesUseCase — Application Use Case (Functional Sandwich pattern).
 *
 * Orchestrates the fetch and persistence of missing daily OHLCV prices.
 * All I/O is isolated behind ports — the use case itself is pure business logic.
 *
 * Functional Sandwich flow:
 * 1. (Impure) Query ILedgerPort for all unique tracked asset symbols.
 * 2. (Impure) Call IPriceIngestionPort.getLastIngestedDate() per asset to compute gaps.
 * 3. (Pure)   Compute the list of (symbol, fromDate, toDate) ingestion jobs.
 * 4. (Impure) Fetch data via IHistoricalMarketDataPort.getHistoricalOHLCV() for each job.
 * 5. (Impure) Write data via IPriceIngestionPort.writePricesToParquet().
 */

export interface IngestionJob {
  assetId: string;
  symbol: string;
  fromDate: string; // ISO-8601 YYYY-MM-DD
  toDate: string;   // ISO-8601 YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Pure helpers (no side effects — easily unit testable)
// ---------------------------------------------------------------------------

/**
 * Computes the minimal set of ingestion jobs from a map of asset → last date.
 * Everything from (lastDate + 1 day) to today needs to be fetched.
 */
export function computeIngestionJobs(
  assets: { assetId: string; symbol: string }[],
  lastDates: Map<string, string | null>,
  today: string, // ISO-8601
): IngestionJob[] {
  return assets.flatMap(({ assetId, symbol }) => {
    const lastDate = lastDates.get(symbol) ?? null;
    const fromDate = lastDate ? addDays(lastDate, 1) : '2020-01-01'; // sane default start

    // If already up-to-date, skip
    if (fromDate > today) return [];

    return [{ assetId, symbol, fromDate, toDate: today }];
  });
}

/** Returns the ISO-8601 date string N days after the given date. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns today's date as ISO-8601 string (UTC). */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Use Case
// ---------------------------------------------------------------------------

export class IngestDailyPricesUseCase {
  private readonly ledgerPort: ILedgerPort;
  private readonly priceIngestionPort: IPriceIngestionPort;
  private readonly historicalMarketDataPort: IHistoricalMarketDataPort;

  constructor(
    ledgerPort: ILedgerPort,
    priceIngestionPort: IPriceIngestionPort,
    historicalMarketDataPort: IHistoricalMarketDataPort,
  ) {
    this.ledgerPort = ledgerPort;
    this.priceIngestionPort = priceIngestionPort;
    this.historicalMarketDataPort = historicalMarketDataPort;
  }

  async execute(): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];

    // -------------------------------------------------------------------------
    // Step 1 — (Impure) Get all unique tracked asset symbols from the ledger
    // -------------------------------------------------------------------------
    const trackedAssets = await this.ledgerPort.getTrackedAssets();

    if (trackedAssets.length === 0) {
      console.log('[IngestDailyPricesUseCase] No tracked assets found — skipping ingestion.');
      return results;
    }

    // -------------------------------------------------------------------------
    // Step 2 — (Impure) Query the last ingested date per asset
    // -------------------------------------------------------------------------
    const lastDateEntries = await Promise.all(
      trackedAssets.map(async ({ symbol }) => {
        const lastDate = await this.priceIngestionPort.getLastIngestedDate(symbol);
        return [symbol, lastDate] as [string, string | null];
      }),
    );
    const lastDates = new Map<string, string | null>(lastDateEntries);

    // -------------------------------------------------------------------------
    // Step 3 — (Pure) Compute the minimal set of ingestion jobs
    // -------------------------------------------------------------------------
    const today = todayUTC();
    const jobs = computeIngestionJobs(trackedAssets, lastDates, today);

    if (jobs.length === 0) {
      console.log('[IngestDailyPricesUseCase] All assets are up-to-date — nothing to ingest.');
      return results;
    }

    console.log(`[IngestDailyPricesUseCase] ${jobs.length} ingestion job(s) queued.`);

    // -------------------------------------------------------------------------
    // Step 4 & 5 — (Impure) Fetch + persist for each job
    // -------------------------------------------------------------------------
    for (const job of jobs) {
      const result: IngestionResult = {
        asset: job.symbol,
        datesFetched: 0,
        errors: [],
      };

      try {
        console.log(
          `[IngestDailyPricesUseCase] Fetching ${job.symbol} from ${job.fromDate} to ${job.toDate}...`,
        );

        // Step 4 — Fetch historical OHLCV records from the external provider
        const records = await this.historicalMarketDataPort.getHistoricalOHLCV(
          job.symbol,
          job.fromDate,
        );

        // Hydrate assetId onto records (provider only returns symbol)
        const hydratedRecords = records.map((r) => ({ ...r, assetId: job.assetId }));

        result.datesFetched = hydratedRecords.length;

        if (hydratedRecords.length === 0) {
          console.log(`[IngestDailyPricesUseCase] No new records for ${job.symbol}.`);
          results.push(result);
          continue;
        }

        // Step 5 — Persist to Parquet via the ingestion port
        await this.priceIngestionPort.writePricesToParquet(hydratedRecords);

        console.log(
          `[IngestDailyPricesUseCase] ✅ ${job.symbol}: ${hydratedRecords.length} records written.`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[IngestDailyPricesUseCase] ❌ ${job.symbol} failed: ${message}`);
        result.errors.push(message);
      }

      results.push(result);
    }

    return results;
  }
}
