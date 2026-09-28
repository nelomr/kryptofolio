## Why

The Fiscal Integrity panel's `MISSING_PRICE` flag reads identically for two states that need different user actions: a price that has not been attempted yet (transient, resolves on the next backfill cycle) and a price whose automatic backfill failed after all retries (may need a manual price override). Because backfill failures are never persisted, the panel appears to flip between "all OK" and "missing price" across reloads of the same ledger, and the user cannot tell whether to wait or act.

Evidence from two independent investigations:

- Not a read-side race: `GetFiscalIntegrityUseCase.ts:67-73` gates reads through `FifoChainFreshnessService.ensureFresh()`; the DuckDB rebuild is a single transaction (`packages/database/src/adapters/DuckDbAdapter.ts:1590-1626`); `getDataQuality()` is pure SQL with no network calls at read time.
- Root cause: `MISSING_PRICE` reflects whether the Parquet-backed `historical_prices` view has a row for the asset/date. That data is backfilled asynchronously and best-effort by `PriceIngestionJob.ts` (at boot and every 24h) → `IngestDailyPricesUseCase.ts` → `KrakenMarketDataAdapter.ts#getHistoricalOHLCV` (lines 187-268, 5 attempts with exponential backoff on HTTP 429). When all attempts fail, the per-asset job is swallowed by the try/catch at `IngestDailyPricesUseCase.ts:129-161` and only logged (`console.error` / `bffLogger.warn`). No failure marker is persisted. A price that does land is durably written and deduplicated by `DuckDbParquetPriceAdapter.ts#writePricesToParquet` and is never re-fetched.

## What Changes

- Persist the outcome of each price-backfill attempt per asset and date range (for example: attempted-at, outcome, consecutive failure count, last error class). SQLite is the source of truth, so this is not a DuckDB-only derived state.
- Change `IngestDailyPricesUseCase` so a per-asset failure after exhausting retries is recorded through a port rather than only logged. Successful ingestion clears or supersedes the failure record.
- Split the missing-price diagnosis the Fiscal Integrity read model exposes into distinct states: *not yet attempted / pending* (retries automatically, no action needed) and *backfill failed* (N attempts, last attempt at `<date>`, consider a manual price override). A price that is present stays unflagged.
- In the Fiscal Integrity panel, render these as visibly different states and, for *backfill failed*, show a CTA that opens the existing spot-transaction edit dialog at its price override (the `spot_transaction_overrides` / `price_edited` mechanism from `add-spot-transaction-edit-overrides`).
- Non-goals: working around Kraken's rate limits, adding or switching price providers, synchronous on-read price fetching, changing FIFO matching or tax figures, and changing retry or backoff policy.

## Capabilities

### New Capabilities
- `price-backfill-observability`: Persisted per-asset/date-range backfill attempt tracking (outcome, attempt count, last-attempted-at) recorded by the daily price ingestion, and the query that exposes it to read models.

### Modified Capabilities
- `fifo-data-quality-flags`: The missing-price diagnosis must distinguish *pending/not yet attempted* from *backfill failed*, instead of a single undifferentiated `MISSING_PRICE`. The existing flag vocabulary is extended, not bypassed.
- `fiscal-integrity`: Consistency warnings must render the two missing-price states differently and offer a manual price override CTA for *backfill failed* rows.

## Impact

- **Backend**: `IngestDailyPricesUseCase.ts`, `PriceIngestionJob.ts`, a new domain port for backfill-attempt records plus its `*Adapter.ts`, the DI composition root, `GetFiscalIntegrityUseCase.ts`, and the fiscal-integrity route/DTOs.
- **Database**: a new SQLite STRICT table and migration (`packages/database`). The DuckDB data-quality SQL in `DuckDbAdapter.ts` may join this state. It must remain re-derivable from SQLite.
- **Shared types**: `packages/shared-types/fifo-policy.ts` quality-flag vocabulary.
- **Frontend**: Fiscal Integrity panel components, the RPC DTO/adapter, and a link into the edit dialog from `add-spot-transaction-edit-overrides`. Loads `domain-uiux` / `DESIGN.md` for badge variants.
- **Rules touched**:
  - Rule 5: model backfill status as a discriminated union (`pending` | `failed { attempts, lastAttemptAt }` | `resolved`), not as `hasFailed` plus optional fields.
  - Rule 6: this is a data-quality and diagnostic concern only. It must not alter tax FIFO ordering or custody allocation, and it stays out of the FIFO materializer's matching logic.
  - Rule 8: persisted status is the durable fix. There is no on-read fetch and no suppression of the flag.
  - Rule 2/3: persistence goes through a port and adapter, and the domain receives typed status values.
  - Rule 7 is not affected, because no source-profile or exchange-export parsing changes.
- **Dependency**: this relies on the override mechanism from `add-spot-transaction-edit-overrides` being archived or merged first.
