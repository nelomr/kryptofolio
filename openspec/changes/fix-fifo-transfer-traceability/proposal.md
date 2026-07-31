## Why

The FIFO engine treats custody movements between the user's own wallets and exchanges as taxable disposals. In the current development ledger there are **zero `SELL` transactions**, yet the engine materialises **73 disposal events** producing **+1.234,46 € of phantom capital gains**, and it fabricates **64 zero-cost-basis lots out of 96**. Every `WITHDRAWAL` closes a real lot ("sold") and every `DEPOSIT` opens a new lot with no history and no cost — the lot's chain of custody is destroyed at exactly the moment it crosses accounts. On top of that, `total_fiat` is persisted with the CSV's negative sign on 11 of 29 `BUY` rows, yielding **negative unit costs** (e.g. `-1,6724 €/XRP`), which turns those phantom disposals into *positive* gains instead of losses.

This corrupts the Spanish IRPF Savings Base (`getSpanishTaxReport` sums these events), the portfolio cost basis (`DuckDbMetricsAdapter` aggregates `remaining_qty * unit_cost_fiat`), and the user-facing lot table — which additionally renders the state **inverted**, labelling fully-consumed lots as `ABIERTO` with a green profit badge and genuinely open lots as `VENDIDO`. The existing `spot-fifo-tax-calculator` spec already mandates that transferred amounts be ignored for tax purposes; the implementation violates its own contract.

### Prior art

`Wealthfolio` documents that `TRANSFER_OUT` reduces lots by FIFO and `TRANSFER_IN` creates a **new lot** carrying the cost basis forward, with fees affecting cash only — cost basis is preserved, but scoped per account. `Ghostfolio` has no custody model at all; its recommended workaround is a `SELL` on the origin account plus a `BUY` on the destination, which is precisely the defect this change removes.

Neither model is sufficient here. Wealthfolio's account-scoped re-lotting dates the destination lot at the transfer instant, which **reorders global per-asset FIFO as a side effect of a non-taxable event** — acceptable for a net-worth tracker, incorrect for a Spanish IRPF declaration. This change keeps one immutable lot per acquisition and models custody as a separate, append-only double-entry ledger.

## What Changes

### 1. Declarative FIFO event policy (root cause of the leak)

- **BREAKING (internal)**: replace the three hardcoded, drift-prone `tx_type NOT IN ('TRANSFER_IN','TRANSFER_OUT','MIGRATION_SWAP')` predicates in `v_flattened_fifo_events` with a single data-driven policy relation seeded from a canonical `FIFO_EVENT_POLICY` map exported by `@kryptofolio/shared-types`.
- The policy declares, per `tx_type`, four independent booleans: `generatesAcquisition`, `generatesDisposal`, `generatesFeeDisposal`, `taxableDisposal`. `DEPOSIT` / `WITHDRAWAL` / `TRANSFER_IN` / `TRANSFER_OUT` / `MIGRATION_SWAP` get no principal acquisition and no principal disposal, but the crypto network fee **is still** extracted as a disposal, satisfying the existing spec requirement that the current code silently drops.
- Fixes the third `UNION ALL` branch (crypto-fee disposals), which today has **no `tx_type` filter at all** — so even correctly-typed transfers generate disposals via their network fee.

### 2. Fiat-vs-crypto asset classification

- Add `assets.is_fiat` so a fiat `DEPOSIT`/`WITHDRAWAL` (EUR in/out of an exchange) is never a crypto acquisition, and is distinguished from a crypto custody movement.

### 3. Sign and magnitude integrity at ingestion

- **BREAKING (data)**: `total_fiat` and `price_fiat` become non-negative magnitudes. Direction is carried by `tx_type` + `asset_in_id`/`asset_out_id`, never by sign. `CsvIngestionUseCase` applies `.abs()` (it already does for `amount_in`/`amount_out` — the asymmetry is the bug), backed by a SQL `CHECK` constraint.
- `toSpotTxType()` stops defaulting unknown types to `'BUY'` and raises a controlled error instead.
- `KrakenSpotCsvParser` stops using `Math.random()` in transaction IDs, restoring idempotency and making re-ingestion safe.

### 4. No invented prices — explicit data-quality flags

- Remove `COALESCE(price, 1.0)` and `COALESCE(price, 0.0)` from the fee-valuation paths. Missing historical prices must propagate as `NULL`.
- Disposal events with an unresolvable price are emitted with `is_taxable = 0` and `quality_flag = 'MISSING_PRICE'` instead of a silently invented value.
- Rows whose `fiat_currency` disagrees with the fee/price currency are flagged `CURRENCY_MISMATCH`.
- Data-quality defects live in a **new `quality_flag` column, separate from the existing `flag`** column. The live `WALLET_ACTIVATION` fiscal classification (Tangem wallet activation, kept for the AEAT audit trail) is preserved untouched — an operation can be a legitimately classified event *and* carry a valuation defect, so the two vocabularies must not merge.
- Flags never block a rebuild. They are counted and surfaced for review.

### 5. Custody as a double-entry ledger — no time or amount heuristics

- **Every** crypto `WITHDRAWAL` / `TRANSFER_OUT` / `DEPOSIT` / `TRANSFER_IN` is a custody movement, recorded as balanced debit/credit entries per asset.
- When the counterparty account is unknown, it resolves to a **synthetic per-asset account** `ownwallet-<ASSET>` which acts as both sink and source. Lots accumulate there and continue to follow the same allocation logic — self-custody for years is representable with no special case.
- **No time window and no amount matching.** Pairing is replaced by balances, which makes the result order-independent, idempotent, and immune to fee drift. The residual left in `ownwallet-<ASSET>` *is* the measurable fee margin.
- A **negative** `ownwallet-<ASSET>` balance means crypto entered from an unrecorded source — flagged `quality_flag = 'UNTRACKED_INFLOW'`, the fiscally dangerous case of a holding with no cost basis.
- Lots are **never split into new rows**. One acquisition remains one lot with its original `acquisition_timestamp` and `unit_cost_fiat`; its quantity is *distributed* across custodying accounts. Partial movements are fully traceable without perturbing global FIFO order.
- Custody allocation uses a per-account FIFO ordering that is explicitly independent of, and has no effect on, the global per-asset FIFO used for taxation.

### 6. Manual overrides as calculation inputs, never as edited outputs

- New user-authored tables `manual_price_overrides` and `transfer_destination_overrides` feed **into** the DuckDB computation. They are never written or deleted by reconciliation.
- The user can assign a fiat value to a transaction whose price could not be resolved, and can correct a movement's inferred counterparty account away from `ownwallet-<ASSET>`.
- Overridden values are marked as manual in the audit trail, so a declared figure is never silently indistinguishable from a market-sourced one.

### 7. Account hierarchy and synthetic accounts

- `accounts.parent_account_id` models exchange sub-wallets (`Kraken:spot`, `Kraken:earn`, `Kraken:futures`), so blocked-in-staking balance is distinguishable from free balance.
- `accounts.is_synthetic` marks `ownwallet-<ASSET>` accounts: included in custody arithmetic, excluded from user-facing account selectors.
- `KrakenSpotCsvParser` starts reading the `wallet` CSV column it currently discards.

### 8. Automatic rebuild

- Materialisation is triggered automatically at the end of an ingestion batch and after an override edit, orchestrated in the application layer rather than by the HTTP route. The manual `POST /api/portfolio/rebuild` endpoint remains as an explicit retry.
- `needs_recalculation` is retained, reframed from "the user must press Sync" to "work is pending" — so a failed automatic rebuild stays retryable.

### 9. Unified lot status enum

- **BREAKING (API)**: eliminate the parallel `FULL | PARTIAL | EMPTY` vocabulary from `GetTokenHistoryUseCase`, `ExternalTaxLotSchema`, and `TaxLotEntity`. The canonical `TAX_LOT_STATUSES = ['OPEN','PARTIAL','CLOSED']` (already the SQL `CHECK` constraint and the DuckDB view output) becomes the single vocabulary end to end.
- The backend stops recomputing status from quantities and propagates the view's value.
- Fixes the inverted UI mapping in `ExpandedLotsTable.vue` (`EMPTY → lot_status.open` + `profit` badge) and its inverted i18n consumption.

### 10. Disposal provenance instead of hardcoded `'SELL'`

- `lot_history_events` gains a `disposal_type` column (`SELL | SWAP | FEE | SPEND`) derived from the source transaction. `GetTokenHistoryUseCase` stops hardcoding `operation_type: 'SELL'` on every event.

### 11. Materialisation reconciliation

- `FifoMaterializerService` currently only UPSERTs, leaving **5 orphan lots and 3 orphan events** pointing at deleted or non-existent transactions. It gains set reconciliation over derived tables only: rows absent from the recomputed set are soft-deleted within a single transaction. User-authored override tables are outside its reach by construction.

### 12. Clean-slate migration

- The project has no production deployment and all source CSVs can be re-ingested. Migration `004` therefore **purges transactional and derived ledger data** rather than carrying repair and backfill logic for rows that must be re-ingested anyway (the discarded Kraken `wallet` column cannot be recovered retroactively).
- This removes an entire class of complexity: no `ABS()` repair path, no ambiguous `disposal_type` backfill, no period where two account-identity models coexist.

## Capabilities

### New Capabilities
- `fifo-event-policy`: Declarative, single-source-of-truth policy mapping each `tx_type` to the FIFO events it generates, replacing duplicated SQL predicates.
- `non-taxable-transfer-classification`: Rules that classify custody movements between the user's own accounts as non-taxable, distinguishing them from fiat funding and from genuine disposals.
- `lot-custody-traceability`: Double-entry custody ledger tracking which account holds each portion of each lot over time, with `ownwallet-<ASSET>` as the default counterparty and no time or amount heuristics.
- `account-hierarchy`: Exchange sub-wallet parent/child accounts and synthetic accounts, so blocked balance is distinguishable from free balance and synthetic counterparties stay out of user-facing selectors.
- `manual-fiscal-overrides`: User-authored price and transfer-destination overrides that feed into the calculation as inputs, survive rebuilds, and are marked as manual in the audit trail.
- `fifo-data-quality-flags`: Explicit flagging of missing prices, currency mismatches, custody residuals, and untracked inflows instead of silent numeric defaults — advisory, never blocking.
- `fifo-materialization-reconciliation`: Deterministic reconciliation between the recomputed FIFO set and the materialised SQLite tables, scoped strictly to derived data.
- `automatic-portfolio-rebuild`: Application-layer orchestration that materialises automatically after an ingestion batch or an override edit, with `needs_recalculation` as a retryable pending-work marker.

### Modified Capabilities
- `spot-fifo-tax-calculator`: Event flattening becomes policy-driven; the fee-disposal branch is scoped by policy; invented price fallbacks are removed; lot status uses the canonical enum; disposal provenance is preserved; custody FIFO is separated from taxation FIFO.
- `csv-data-ingestion`: Fiat magnitudes are sign-normalised and constrained; unknown `tx_type` values fail loudly instead of defaulting to `BUY`; transaction IDs are deterministic so re-ingestion is idempotent; the Kraken `wallet` column resolves sub-accounts.
- `fiscal-domain`: `TaxLotEntity.status` adopts `OPEN | PARTIAL | CLOSED`; `TaxLotHistoryEvent` gains `disposalType` and a typed `flag`; custody locations and manual-value provenance enter the domain model.
- `fiscal-integrity`: The integrity surface consumes the new data-quality flags and exposes the pending-review count and the manual-assignment affordance.
- `hierarchical-table`: Level-2 lot status rendering is corrected; custody location is shown; Level-3 events display real provenance and non-taxable badges instead of a universal `SELL`.
- `sqlite-transactional-ledger`: New `lot_custody_entries`, `manual_price_overrides`, `transfer_destination_overrides` tables; `assets.is_fiat`; `accounts.parent_account_id` and `accounts.is_synthetic`; `lot_history_events.disposal_type` and a new `quality_flag` separate from the retained `flag`; `v_active_*` views and audit triggers for every new table; non-negative fiat `CHECK` constraints.
- `database-migrations`: New forward migration `004_fifo_traceability.sql` performing additive DDL plus a documented clean-slate purge of transactional and derived data.
- `tax-audit-report`: The audit trail distinguishes taxable disposals from non-taxable custody movements, exposes flag reasons, and marks manually-assigned values.

## Impact

**Analytical engine (DuckDB)**
- `packages/database/src/adapters/DuckDbAdapter.ts` — `v_flattened_fifo_events`, `v_acquisitions`, `v_disposals`, `v_fifo_matches`, `v_calculated_tax_lots`, `v_calculated_lot_history_events`; new `fifo_event_policy` relation, `v_custody_entries`, `v_lot_custody_allocation` (recursive), `v_lot_current_location`, `v_custody_balances`, `v_fifo_data_quality`.
- `apps/backend/src/core/infrastructure/adapters/DuckDbMetricsAdapter.ts` — cost-basis aggregation currently sums phantom zero/negative-cost lots.
- `apps/backend/src/core/infrastructure/adapters/DuckDbTaxCalculatorAdapter.ts` — Spanish tax report base sums.

**Persistence**
- `packages/database/migrations/sqlite/004_fifo_traceability.sql` (new).
- `apps/backend/src/core/infrastructure/adapters/SQLiteLedgerAdapter.ts` — reconciliation, custody entries, account hierarchy resolution.

**Domain ports (contract-first — must precede adapter work)**
- `apps/backend/src/core/domain/ports/ITaxCalculatorPort.ts` — must declare custody entries and data-quality rows before any adapter can return them.
- `apps/backend/src/core/domain/ports/ILedgerPort.ts` — reconciliation replaces the UPSERT-only contract; override CRUD; `ensureAccountExists` gains venue/wallet; `ensureAssetExists` gains `is_fiat`.
- `apps/backend/src/core/infrastructure/di/container.ts` — registration of the orchestrator and override use cases.

**Domain / shared contracts**
- `packages/shared-types/src/schemas/ledger.ts` — `FIFO_EVENT_POLICY`, `DISPOSAL_TYPES`, `FIFO_QUALITY_FLAGS`, `FISCAL_CLASSIFICATION_FLAGS`, `FLAG_SEVERITY`, `MANUAL_VALUE_PROVENANCE`, synthetic-account naming contract.
- `packages/core-domain/src/domain/services/TransactionNormalizer.ts` and `handlers/transfer.ts` — custody-movement classification.
- `apps/frontend/src/core/domain/models/FiscalEntities.ts` — `TaxLotEntity`, `TaxLotHistoryEvent`, custody value objects.
- `apps/frontend/src/core/domain/models/BrandedTypes.ts` — account and override identifiers.

**Application layer**
- `apps/backend/src/core/application/services/FifoMaterializerService.ts` — reconciliation, custody materialisation.
- `apps/backend/src/core/application/use-cases/CsvIngestionUseCase.ts` — sign normalisation, strict type mapping, sub-account resolution.
- `apps/backend/src/core/application/use-cases/IngestAndMaterializeUseCase.ts` (new) — composes ingestion with automatic materialisation.
- `apps/backend/src/core/application/use-cases/SetManualPriceOverrideUseCase.ts`, `SetTransferDestinationUseCase.ts` (new).
- `apps/backend/src/core/application/use-cases/GetTokenHistoryUseCase.ts` — canonical status, real provenance, custody.

**Anti-corruption layer & UI**
- `apps/frontend/src/core/infrastructure/dtos/ExternalTaxSchemas.ts`, `MockDtoSchemas.ts` — status enum realignment, custody and flag schemas.
- `apps/frontend/src/core/infrastructure/csv/KrakenSpotCsvParser.ts` — deterministic IDs, `wallet` column.
- `apps/frontend/src/views/Portfolio/components/table/ExpandedLotsTable.vue`, `LotEventHistory.vue` — inverted status fix, custody and provenance display.
- Pending-review surface for manual value assignment, wired via Pinia Colada `useMutation`.
- `apps/frontend/src/i18n/dictionaries/{es,en}.ts` — status, provenance, and flag labels.

**Operational**
- Migration `004` purges transactional and derived ledger data. Source CSVs must be re-ingested afterwards; this is required regardless, since the Kraken `wallet` column needed for sub-account identity was never persisted.
- Previously reported IRPF figures are superseded. They were derived from phantom disposals.

**Explicitly out of scope**
- Full multi-currency conversion (USD↔EUR normalisation) remains owned by `market-data-fiat-normalization`; this change only *detects and flags* mismatches.
- Automated historical price backfill remains owned by `historical-price-storage`; this change surfaces gaps and provides the manual-assignment path.
- Futures and derivatives P&L calculation is untouched.
- The FIFO matching algorithm itself (cumulative-interval overlap in `v_fifo_matches`) is retained unchanged.
