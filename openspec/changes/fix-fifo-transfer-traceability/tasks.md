## 1. Baseline Evidence (do first — makes the fix provable)

- [x] 1.1 Record the pre-fix metrics of the current ledger to `baseline.md`: tx_type distribution, `SELL`/`SWAP` count (expect 0), `tax_lots` count and zero-cost count (expect 96 / 64), `lot_history_events` count (expect 73), orphan lot/event count (expect 5 / 3), negative `total_fiat` count (expect 11), and `SUM(gain_loss_fiat)` grouped by source `tx_type` (expect +1234.46 for `WITHDRAWAL`)
- [x] 1.2 ~~Locate source CSV paths~~ — **superseded**: verification is test-driven via a Kraken CSV fixture (task 13.3), no manual re-ingestion required
- [x] 1.3 Create a regression fixture `packages/database/tests/fixtures/transfer-traceability.ts` covering: `BUY` 179.11 XRP with negative `total_fiat`; crypto `DEPOSIT`; `WITHDRAWAL` with crypto fee; `STAKING` with unresolvable price; a withdrawal to an unknown destination with no matching deposit; a partial transfer of one lot across two accounts; a Kraken `spot`→`earn` sub-wallet move; and one genuine `SELL` interleaved between transfers
- [x] 1.4 Write failing integration tests asserting the target end state on that fixture: zero non-`FEE` disposal events, no zero-cost lot from the `DEPOSIT`, positive `unit_cost_fiat`, lot `status = 'OPEN'` after the withdrawal, custody split correctly across accounts, and correct cost basis on the genuine `SELL`

## 2. Canonical Contracts (`@kryptofolio/shared-types`)

- [x] 2.1 Write a unit test asserting `Object.keys(FIFO_EVENT_POLICY)` equals `SPOT_TX_TYPES` exactly (no missing, no extra keys)
- [x] 2.2 Add the `FifoEventPolicy` interface (`generatesAcquisition`, `generatesDisposal`, `generatesFeeDisposal`, `taxableDisposal`) and export `FIFO_EVENT_POLICY` typed as `Record<SpotTxType, FifoEventPolicy>` with the values from design D1
- [x] 2.3 Export `DISPOSAL_TYPES = ['SELL','SWAP','FEE','SPEND']` and its `DisposalType` union
- [x] 2.4 Export `FIFO_QUALITY_FLAGS = ['MISSING_PRICE','CURRENCY_MISMATCH','CUSTODY_RESIDUAL','UNTRACKED_INFLOW','CUSTODY_IMBALANCE','NEGATIVE_COST_BASIS','ORPHAN_LOT','UNKNOWN_TX_TYPE']`, its `FifoQualityFlag` union, and a `FLAG_SEVERITY` map defined once (highest for `UNTRACKED_INFLOW` and `NEGATIVE_COST_BASIS`, lowest for `CUSTODY_RESIDUAL`)
- [x] 2.5 Add `MANUAL_VALUE_PROVENANCE` (market vs manual) as a typed union
- [x] 2.6 Export `FISCAL_CLASSIFICATION_FLAGS` containing the existing live `WALLET_ACTIVATION` value, keeping it strictly separate from `FIFO_QUALITY_FLAGS`; add a unit test asserting the two vocabularies share no member
- [x] 2.7 Extend the ledger Zod schemas with required `disposal_type`, optional typed `quality_flag`, the retained `flag`, `is_fiat`, `parent_account_id`, `is_synthetic`, and the override-table shapes — no `.default()` values, no `any`
- [x] 2.8 Verify tests 2.1 and 2.6 pass and that removing a `SPOT_TX_TYPES` entry from the policy is a type error

## 2b. Domain Ports (must precede any adapter work)

- [x] 2b.1 Extend `ITaxCalculatorPort.calculateLotsAndEvents` to also return custody entries and data-quality rows, or add dedicated port methods for them — the adapter cannot expose data the port does not declare
- [x] 2b.2 Extend `ILedgerPort` with reconciliation methods for `tax_lots`, `lot_history_events`, and `lot_custody_entries` (replacing the UPSERT-only `upsertTaxLots` / `upsertLotHistoryEvents` contract), and with CRUD for the two override tables
- [x] 2b.3 Extend `ILedgerPort.ensureAccountExists` to accept the venue and optional wallet designation so sub-accounts and the `is_synthetic` marker are expressible through the port
- [x] 2b.4 Extend `ILedgerPort.ensureAssetExists` to accept and persist the `is_fiat` classification
- [x] 2b.5 Add the port interfaces for the override use cases; confirm every new port lives in `core/domain/ports/` as an interface and that no `repositories` folder is introduced
- [x] 2b.6 Type-check the workspace and confirm the existing adapters fail to compile until updated — proving the port is the contract

## 3. Domain — Pure Classification and Naming (`@kryptofolio/core-domain`)

- [x] 3.1 Write unit tests: Kraken crypto `withdrawal` → custody movement; Kraken fiat `deposit` → fiat funding; unknown → rejection; `deriveSyntheticAccountName('xrp')` and `('XRP')` both yield `ownwallet-XRP`
- [x] 3.2 Add a pure `classifyCustodyMovement` function under `packages/core-domain/src/domain/services/` resolving custody vs fiat-funding semantics from asset classification, with no Zod/Axios/Vue imports
- [x] 3.3 Add a pure `deriveSyntheticAccountName(assetSymbol)` function as the single naming contract for `ownwallet-<ASSET>`, normalising the symbol first
- [x] 3.4 Add a pure `deriveSubAccountId(venue, wallet)` function producing deterministic, stable child-account identifiers
- [x] 3.5 Update `handlers/transfer.ts` and `TransactionNormalizer.ts` to route `deposit`/`withdrawal` through the classifier instead of mapping them verbatim
- [x] 3.6 Run `scripts/check-domain-isolation.sh` and confirm it passes

## 4. Schema Migration (`004_fifo_traceability.sql`)

- [x] 4.1 Write a migration test asserting: idempotent re-run; `_schema_migrations` records `004`; all new columns and tables exist; transactional and derived tables are empty; vault, `user_settings`, and migration history are preserved
- [x] 4.2 Add additive DDL — `assets.is_fiat`, `accounts.parent_account_id` (+ index) and `accounts.is_synthetic`, `lot_history_events.disposal_type`, constrained `lot_history_events.flag`
- [x] 4.3 Create the `STRICT` `lot_custody_entries` table (`tax_lot_id`, `account_id`, signed `qty_delta`, `occurred_at`, `spot_transaction_id`, soft-delete columns) with FKs and the project's numeric GLOB CHECK pattern, documenting `qty_delta` as intentionally signed
- [x] 4.4 Create the `STRICT` `manual_price_overrides` table keyed by deterministic transaction identity, with required `fiat_currency`, non-negative `price_fiat` CHECK, optional note, and audit timestamps
- [x] 4.5 Create the `STRICT` `transfer_destination_overrides` table with an FK to `accounts`, a CHECK preventing a self-referential counterparty, optional note, and audit timestamps
- [x] 4.6 Add non-negative CHECK constraints to `spot_transactions.total_fiat`/`price_fiat` and `tax_lots.unit_cost_fiat`/`total_cost_fiat`; document which columns remain signed and why
- [x] 4.7 Purge transactional and derived data (`spot_transactions`, `futures_transactions`, `tax_lots`, `lot_history_events`, `lot_custody_entries`), preserving vault, `user_settings`, and `_schema_migrations`
- [x] 4.7b Add `lot_history_events.quality_flag TEXT` constrained to the data-quality vocabulary or `NULL`, leaving the existing `flag` column and its `WALLET_ACTIVATION` semantics intact
- [x] 4.8 Seed `is_fiat = 1` for recognised ISO-4217 symbols; do NOT pre-seed synthetic accounts
- [x] 4.8b Add `v_active_lot_custody_entries`, `v_active_manual_price_overrides`, and `v_active_transfer_destination_overrides` views mirroring the `v_active_*` convention established in `002_ledger_schema.sql`
- [x] 4.8c Add `AFTER UPDATE` audit triggers for `lot_custody_entries` and both override tables, matching the six existing `trg_*_audit` triggers, so the non-destructive audit policy holds for every new table
- [x] 4.9 Set `user_settings.needs_recalculation = 'true'` as the final migration statement
- [x] 4.10 Verify test 4.1 passes and assert the migration contains no `ABS()` repair and no heuristic `disposal_type` backfill
- [x] 4.11 Add a test asserting every new table is reachable through a `v_active_*` view and carries an audit trigger

## 5. DuckDB Engine — Policy-Driven Event Flattening

- [x] 5.1 Write a test asserting the view definitions returned by `duckdb_views()` contain no `'TRANSFER_IN'`, `'TRANSFER_OUT'`, `'MIGRATION_SWAP'`, `'DEPOSIT'`, or `'WITHDRAWAL'` literal, and no `COALESCE` over a `historical_prices` column with a non-null literal
- [x] 5.2 Seed the `fifo_event_policy` table at bootstrap from `FIFO_EVENT_POLICY` using a single multi-row `INSERT` or the Appender API — never one `INSERT` per row
- [x] 5.3 Rewrite `v_flattened_fifo_events`: replace all three inline `NOT IN` predicates with joins on `fifo_event_policy`, gating the acquisition branch on `generates_acquisition`, the principal-disposal branch on `generates_disposal`, and the fee branch on `generates_fee_disposal`
- [x] 5.4 Exclude `is_fiat` assets from every branch by joining `ledger.assets`
- [x] 5.5 Remove `COALESCE(hp_fee_dis.close, 1.0)` and `COALESCE(hp_fee_acq.close, 0.0)`; let unresolved prices propagate as `NULL`
- [x] 5.6 Apply `manual_price_overrides` as a precedence layer over resolved market prices, and emit the resulting manual-value provenance
- [x] 5.7 Emit `disposal_type` per branch and derive `flag` (`MISSING_PRICE`, `CURRENCY_MISMATCH`) in `v_calculated_lot_history_events`, forcing `is_taxable = 0` on any flagged event
- [x] 5.8 Add the negative/zero-basis guard: flag lots with `unit_cost_fiat < 0` as `NEGATIVE_COST_BASIS` and force `is_taxable = 0` on their matched disposals
- [x] 5.9 Fix the dual-source fallback in `getSpanishTaxReport`: the `UNION ALL ... WHERE (SELECT COUNT(*) FROM ledger.lot_history_events) = 0` branch currently sums every event regardless of taxability — add the `is_taxable = 1` filter to both branches and report the excluded count alongside the total
- [x] 5.10 Apply the same audit to `DuckDbMetricsAdapter`: its cost-basis aggregations use the same dual-source `UNION` over `v_calculated_tax_lots` / `ledger.tax_lots` and must exclude lots flagged `NEGATIVE_COST_BASIS` or `MISSING_PRICE` from headline cost basis while reporting them separately
- [x] 5.11 Verify tests 5.1 and 1.4 pass, and that `PRINTF`-formatted string output still satisfies SQLite's GLOB constraints

## 6. DuckDB Engine — Double-Entry Custody

- [x] 6.1 Write tests: every custody movement emits balanced entries summing to zero; unknown counterparty resolves to `ownwallet-<ASSET>`; a destination override redirects the entry; custody derivation is order-independent and byte-identical across reruns
- [x] 6.2 Create `v_custody_entries` emitting one debit and one credit per custody movement, resolving the counterparty as `transfer_destination_overrides` → recorded counterparty → `ownwallet-<ASSET>`
- [x] 6.3 Ensure synthetic accounts are created on demand during materialisation using the shared naming contract, flagged `is_synthetic = 1`
- [x] 6.4 Write tests for custody allocation: the moved quantity draws from the oldest lot held in that account; allocation emits no `lot_history_event`; no lot's `remaining_qty` or `status` changes; no lot row is split
- [x] 6.5 Implement `v_lot_custody_allocation` as a `WITH RECURSIVE` sequential allocation using `USING KEY` to bound intermediate state, scoped per `(account, asset)` and ordered by `acquisition_timestamp`
- [x] 6.6 Create `v_lot_current_location` resolving each lot's quantity per holding account, and `v_custody_balances` exposing per-account per-asset balances including synthetic accounts
- [x] 6.7 Write tests for residual semantics: positive residual beyond fee-scale tolerance → `CUSTODY_RESIDUAL` low severity; residual within tolerance → no flag; negative balance → `UNTRACKED_INFLOW` high severity; tolerance scales with the asset's recorded fees
- [x] 6.8 Add the `CUSTODY_IMBALANCE` check comparing per-account custody totals against on-ledger balances within the precision tolerance
- [x] 6.9 Create `v_fifo_data_quality` returning `flag`, `severity`, `asset_id`, `account_id`, `tx_id`, `occurred_at`, `detail`, and a pending-review marker — and verify it returns zero rows for a clean fixture
- [x] 6.10 Verify tests 6.1, 6.4, and 6.7 pass; benchmark `v_lot_custody_allocation` against `tax_stress_test.spec.ts` and record the timing

## 7. Application Layer — Materialisation Reconciliation

- [x] 7.1 Write tests: orphan lot retired; phantom `DEPOSIT` lot retired with its events and custody entries; second run produces zero writes; restored transaction reactivates its row rather than duplicating; mid-run failure rolls back and leaves `needs_recalculation = 'true'`; override tables byte-identical before and after
- [x] 7.2 Add reconciliation methods to `SQLiteLedgerAdapter` performing insert / update / soft-delete / reactivate against the recomputed ID set, for `tax_lots`, `lot_history_events`, and `lot_custody_entries` only
- [x] 7.3 Rewrite `FifoMaterializerService.recalculate()` to run the full reconciliation inside a single SQLite transaction, clearing `needs_recalculation` only on success
- [x] 7.4 Return a plain `{inserted, updated, retired, reactivated, flagged, pendingReview}` summary per derived table with no HTTP or framework coupling, using `PreciseAmount` for any monetary field
- [x] 7.5 Persist `disposal_type`, `flag`, manual-value provenance, and custody entries through the materialiser
- [x] 7.6 Add a test asserting that emptying all derived tables and re-running produces output identical to an incremental run over the same inputs
- [x] 7.7 Verify tests 7.1 and 7.6 pass

## 8. Application Layer — Ingestion Integrity and Sub-Accounts

- [x] 8.1 Write tests: negative `total_fiat` persisted as absolute value; unknown `tx_type` rejected with a named error while valid rows persist; unresolvable price recorded as unresolved rather than genuine `0`; currency mismatch flagged without mixing arithmetic; `wallet = 'earn'` resolves to `Kraken:earn` under parent `Kraken`
- [x] 8.2 Apply `.abs()` to `total_fiat` and `price_fiat` in `CsvIngestionUseCase` using `Decimal`, matching the treatment already given to `amount_in`/`amount_out`
- [x] 8.3 Replace the `?? 'BUY'` fallback in `toSpotTxType()` with a controlled error naming the offending value and row timestamp; collect rejected rows into the use case result instead of aborting the batch
- [x] 8.4 Mark unresolved fiat magnitudes distinctly from genuine zero so downstream flagging can tell them apart
- [x] 8.5 Resolve and persist `is_fiat` in `ensureAssetExists` from the ISO-4217 code list
- [x] 8.6 Add sub-account resolution: `ensureAccountExists` creates the venue parent and the child account via `deriveSubAccountId`, falling back to the venue when no wallet designation is present
- [x] 8.7 Verify tests 8.1 pass

## 9. Application Layer — Automatic Rebuild and Overrides

- [x] 9.1 Write tests: a 97-row batch triggers materialisation exactly once; a multi-file submission triggers it once; an empty batch triggers none; a failed rebuild leaves `needs_recalculation = 'true'` and retains persisted transactions; the route contains no ordering logic
- [x] 9.2 Add `IngestAndMaterializeUseCase` composing `CsvIngestionUseCase` then `FifoMaterializerService`, accepting pure inputs and returning a plain combined result — no Vue, no Hono, no HTTP import
- [x] 9.3 Assert `CsvIngestionUseCase` holds no reference to the materialiser and remains independently invocable
- [x] 9.4 Point the ingestion route at the orchestrator; keep `POST /api/portfolio/rebuild` as an explicit retry returning the identical summary shape
- [x] 9.5 Write tests: assigning a price clears the `MISSING_PRICE` flag; removing it reverts the derived value; overrides survive rebuild and re-ingestion; batched override edits trigger one rebuild; a destination override cannot target an unknown or self-referential account
- [x] 9.6 Add `SetManualPriceOverrideUseCase` and `RemoveManualPriceOverrideUseCase` with branded identifiers, `PreciseAmount` values, required currency, and an immediate materialisation trigger
- [x] 9.7 Add `SetTransferDestinationUseCase` and its removal counterpart with the same guarantees
- [x] 9.8 Add override routes accepting batched payloads, each validated by a Zod DTO
- [x] 9.9 Register the new use cases in `apps/backend/src/core/infrastructure/di/container.ts` (`IngestAndMaterializeUseCase`, the four override use cases, `FifoMaterializerService` if not already exposed), resolving them through the DI container rather than instantiating in routes
- [x] 9.10 Verify tests 9.1 and 9.5 pass

## 10. Read Path — Canonical Status, Provenance, Custody

- [ ] 10.1 Write tests for `GetTokenHistoryUseCase`: status is passed through unchanged from the view; a fully consumed lot reports `CLOSED`; an untouched lot reports `OPEN`; a fee event reports `disposal_type = 'FEE'`; custody locations are returned per account with the synthetic marker
- [ ] 10.2 Replace `TokenLotDto.status` with the canonical `'OPEN' | 'PARTIAL' | 'CLOSED'` union and delete the quantity-based recomputation at `GetTokenHistoryUseCase.ts:62-67`
- [ ] 10.3 Replace the hardcoded `operation_type: 'SELL'` at `GetTokenHistoryUseCase.ts:108` with the event's `disposal_type`, and expose `flag` and manual-value provenance
- [ ] 10.4 Expose current custody per lot from `v_lot_current_location`, including the `is_synthetic` marker per location
- [ ] 10.5 Add a fiscal-integrity endpoint returning `v_fifo_data_quality` grouped by flag with counts, severities, and the pending-review count
- [ ] 10.6 Extend the rebuild and ingestion responses with the reconciliation summary, validated by a Zod DTO
- [ ] 10.7 Verify tests 10.1 pass

## 11. Anti-Corruption Layer — DTO Realignment

- [ ] 11.1 Write tests: `ExternalTaxLotSchema` accepts `'OPEN'` and rejects `'FULL'` with an `errorBus` emission; `flag`, `disposalType`, and manual provenance parse as typed unions; an unrecognised flag fails validation
- [ ] 11.2 Update `ExternalTaxLotSchema` to the canonical status enum with `status` required, and add `currentLocations`
- [ ] 11.3 Update `ExternalTaxLotHistorySchema` with required `disposalType`, a new optional typed `qualityFlag`, and manual-value provenance — **keeping** the existing `flag: z.enum(["WALLET_ACTIVATION"])` field intact
- [ ] 11.3b Verify the existing `WALLET_ACTIVATION` consumers still pass unchanged: `useTaxCalculations.ts:160`, `LotEventHistory.vue:30`, `TaxTransactionsTable.vue:133`, `TangemCsvParser.ts`, and their three test files
- [ ] 11.4 Update `MockDtoSchemas` to the identical vocabulary so mock and real payloads stay substitutable at the port boundary
- [ ] 11.5 Update `TaxLotEntity` (`status` required, `currentLocations` added) and `TaxLotHistoryEvent` (`disposalType`, typed `flag`, provenance) in `FiscalEntities.ts`, using branded types for identifiers and `PreciseAmount` for quantities
- [ ] 11.6 Add branded types for account and override identifiers in `BrandedTypes.ts` with their Zod parsers
- [ ] 11.7 Add Zod DTO schemas for the fiscal-integrity payload, the rebuild/ingestion summary, and the override mutations
- [ ] 11.8 Make `KrakenSpotCsvParser` read the `wallet` column and derive identifiers from a deterministic content hash, removing `Math.random()` at line 126
- [ ] 11.9 Verify tests 11.1 pass, `scripts/check-domain-isolation.sh` passes, and a repo-wide search finds no `any` in the touched files

## 12. UI — Correct Status, Custody, and Pending Review

- [ ] 12.1 Write component tests: `status = 'OPEN'` renders the open label without the `profit` variant; `status = 'CLOSED'` renders the closed label; a `MISSING_PRICE` lot renders a data-quality indicator and no tax-loss suggestion; a `FEE` event renders a fee indicator and not `SELL`; a manually assigned figure renders its marker
- [ ] 12.2 Delete `getLotStatus`, `getLotBadgeVariant`, and `getLotStatusText` from `ExpandedLotsTable.vue` and render `lot.status` directly with a correct label and variant mapping
- [ ] 12.3 Guard `isLotInLoss` so a zero, negative, or flagged basis renders the data-quality indicator instead of a profit/loss judgement
- [ ] 12.4 Display split custody per account on Level 2 rows, marking synthetic accounts and staking sub-wallets distinctly, alongside the acquiring venue
- [ ] 12.5 Render `disposalType`, non-taxable badges, flag severity, and manual-value markers in `LotEventHistory.vue`; render custody relocations with origin and destination and no P&L figure
- [ ] 12.6 Add a colocated `PendingValuesReview` component under the owning view's `components/` directory listing pending rows with an assignment affordance, using Shadcn `<Card>` wrappers and `<Skeleton>` loading states that match the final geometry
- [ ] 12.7 Wire the fiscal-integrity card and the pending-review surface via Pinia Colada `useQuery`, and the override submissions via `useMutation` — no global Pinia store
- [ ] 12.8 Surface the `needs_recalculation` pending indicator and the explicit rebuild action
- [ ] 12.9 Add i18n keys for `lot_status.closed`, disposal types, every quality flag with its explanation, manual-value markers, and custody labels in both `es.ts` and `en.ts`; remove the inverted `lot_status.open`/`lot_status.sold` usages
- [ ] 12.10 Verify tests 12.1 pass and confirm DESIGN.md compliance: mono for all numerics, no raw `animate-pulse`, brand colour used at most twice per view

## 14. Source Fidelity and Multi-Leg Integrity

**This group runs BEFORE group 13.** Group 13 is end-to-end verification; running it against known
defects would either fail or certify an incomplete system. Two of its tasks are blocked outright:

- **13.3** drives a real Kraken CSV through ingestion. Every Kraken row with a fee currently fails
  persistence — see 14.30c. The fixture cannot load until that is fixed.
- **13.5** asserts fee-event sums. That depends on the fee model in 14γ being correct.

Task IDs are stable because `design.md` and `progress-apply.md` cite them; they are therefore **not
sequential**. Execute top to bottom by phase, not by number.

Every finding here was **measured** against the user's real exports in
`/Users/nelo/proyectos/AgenteIA/cripto-proyect/listadoTransacciones`, not anticipated. The evidence
sits in `design.md` D19–D24 and in the group 7/8 entries of `progress-apply.md`. Four of the six
findings were surfaced by the user reading the source files, and none by the test suite — which is
why the two regression nets, 14.18 and 14.27, exist.

---

### 14α. Foundations — nothing downstream can be measured until these land

These three block work in every other phase, so they come first regardless of severity.

- [ ] 14.20 Break the circular import between `shared-types`'s `ledger.ts` and `fifo-policy.ts`. They import from each other, which resolves under ESM but throws `Cannot access 'FIFO_QUALITY_FLAGS' before initialization` under tsx's CJS transform — and `packages/database`'s seed scripts run under tsx. **Blocks** any fixture or measurement script that runs outside vitest
- [ ] 14.26 **Fix the xlsx precision loss.** `parseExcel` calls `XLSX.utils.sheet_to_json(..., { header: 1 })`, which returns float64 for numeric cells, and `processRawRows` then applies `String(cell)`. Two measured consequences: 13 cells in the real Bit2Me files already carry float noise (`0.15742981799999997` where the source is `0.157429818`), and `String(v)` emits exponential notation below `1e-6`, so `String(0.00000001)` is `"1e-8"` — which `preciseAmountSchema` **rejects**, silently failing the row. Read cells as formatted text (`raw: false`, or the cell's `w` value) so the source's digits survive. **Blocks** every Bit2Me task: deriving a fee as `origen − destino` is meaningless while both operands carry float noise, and 14.27 cannot assert digit for digit
- [ ] 14.30c **Kraken fee amounts reach the ledger with no denomination, violating an invariant at two layers.** Measured: a standalone Kraken row emerges from the normalizer as `fee_amount="0.0050000000"` with `fee_currency=undefined`, because Kraken has no fee-currency column and `mergeRows` only fills it for *merged* rows — a merged trade correctly gets `fee_currency="PUMP"`. Both `LedgerSpotTransactionSchema`'s refine and the SQLite `CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))` reject that pair. Affects 14 real rows: 11 deposits and 1 transfer at `fee = 0`, plus the 2 SOL withdrawals at a genuine `0.005`. Resolve the denomination from the row's own asset in the handler, not in the aggregator. **Blocks 13.3** and any end-to-end Kraken test
- [ ] 14.34 Verify the three above: a tsx script can import `shared-types`; a Bit2Me xlsx cell reaches the ledger with the source's digits; a Kraken row with a fee persists

### 14β. Every real file becomes ingestible

Until these land, two of the six real exports cannot be loaded at all, so no fixture can cover them.

- [ ] 14.15 `WALLET_ACTIVATION` cannot be ingested: `tangem_activacion_xrp.csv` carries it in the `Type` column, but the design models it as a `FISCAL_CLASSIFICATION_FLAGS` value, not a `tx_type`, so ingestion rejects the row and **the file cannot be loaded at all**. Map it to an acquisition-like `tx_type` plus the `WALLET_ACTIVATION` flag, with a test driving the real row shape. Note group 5 recorded this as live production data justifying the separate `flag` column, so the flag must survive to `lot_history_events`
- [ ] 14.16 **DECIDED — a promotional credit becomes a new `PROMOTION` type recorded in the general base.** The row is `Currency: EUR, Amount: 10` — fiat, not crypto, so no lot is created either way (acquisitions require `NOT asset_in_is_fiat`). What was at stake is whether the 10 € survives as income. `REWARD` appears in neither `general_base_airdrops` nor `savings_base_yields`, so it would vanish; `DEPOSIT` makes it indistinguishable from the user's own money; `AIRDROP` would work fiscally but calling a euro credit an airdrop is the kind of untrue label this change exists to remove, and it would permanently mix real airdrops with promotions. `GIFT` is not in `SPOT_TX_TYPES` at all. Add `PROMOTION` to `SPOT_TX_TYPES` with `ACQUISITION_ONLY` policy — the key-parity test in 2.1 forces the policy entry — map the label in `TYPE_MAP`, and include it in `general_base_airdrops`. Same row carries the negative fee of 14.31, so do them together
- [ ] 14.17 **DECIDED — the 315 futures rows stay rejected here; futures collateral becomes a separate change.** 314 `conversion` rows are 157 EUR↔USD collateral pairs (one negative `eur` leg, one positive `usd` leg, same instant, `conversion spread percentage` on the EUR side) and the 1 `cross-exchange transfer` is 200 € arriving in the `flex` account — whose matching leg sits in the *spot* export as `transfer / spottofutures / EUR / -200`, so no single-file aggregation could ever pair them. Neither is a position event. `futures_transactions` models position events: its `tx_type` CHECK cannot be extended without a full table rebuild, and its `symbol` column means the contract, so storing `'eur'` there would repeat the very error class D20 documented. Position events and collateral movements are as distinct as spot and futures, and deserve their own table. Record in `design.md` that this is deferred, and open a follow-up change for a collateral table (account, movement type, currency, signed amount, spread, instant) plus a per-currency balance view. Nothing is lost meanwhile: no rejected row affects crypto FIFO, and `v_futures_realized_pnl` derives PnL from `realized_pnl`, which the accepted 785 rows carry
- [ ] 14.18 Add the **label-level regression net**: drive every distinct type label from every real export through the real normalizer and assert the result is one the ingestion mapper accepts. This is what would have caught the futures vocabulary gap the user found. Must come after 14.15–14.17 so it starts green

### 14γ. The fee model — denomination, convention, and precision as one surface

The single largest source of divergence between exchanges, and the phase most likely to produce a
silently wrong tax figure. Five real exports use **four denomination conventions** and **two
"already applied?" conventions**, and Bitvavo mixes denominations inside one file.

Two independent questions must be answered per row, and conflating them is the hazard:

1. **Denomination** — a fee in the asset is a disposal that reduces the lot's remaining quantity; a
   fee in fiat adjusts the basis and must never touch a quantity.
2. **Already applied?** — every movement is `gross = net + fee`, and each source supplies two of the
   three. Deducting a fee the source already applied destroys quantity still held; ignoring one
   charged on top leaves the balance unaccounted for.

| source | denomination | supplies | derive |
|---|---|---|---|
| Kraken spot | the row's own `asset` (no fee-currency column) | net (`amount`) + `fee` | `gross = net + fee` |
| Bitunix | `Fee Asset` | net (`Outgoing`) + `Fee Amount` | `gross = net + fee` |
| Bit2Me | fee column is a **EUR valuation** | gross (`origen`) + net (`destino`) | `fee = gross − net`, in the asset |
| Bitvavo `buy` | `EUR` | quantity + price + a fee **already inside** the paid total | nothing |
| Bitvavo `withdrawal` | `XRP` / `XLM` named, but amount is `0` | — | nothing needed, see 14.30 |
| Kraken futures | the collateral currency | `fee` column | — |

- [ ] 14.30b **A zero fee is a value and an absent fee is unknown; keep them distinct end to end.** Already true at the normalizer (`fee_amount="0"` vs `undefined`), in `preciseAmountSchema.optional()`, and in the nullable SQL column — verified. Write the regression tests that pin it, and audit for any `Number(fee)`, `!fee` or `fee || …` that would collapse `'0'` into absence. First in this phase because every task below depends on the distinction holding
- [ ] 14.23 Write the denomination tests, one per convention, from the real row shapes: Kraken spot `fee = 17.720` with `asset = PUMP` resolves to `17.720 PUMP`; a Bitvavo `buy` fee in `EUR` adjusts basis and leaves the quantity untouched; Bitunix `Fee Asset = ADA`; Bit2Me's derived `origen − destino`; a fee whose denomination cannot be resolved is reported pending rather than assumed
- [ ] 14.29 Write the convention tests, one per established convention, using the real figures: Kraken's `0.006` net + `0.005` fee debits `0.011`; Bitunix's `546.844684 + 1 = 547.844684`; Bit2Me's `2.236429 − 1.536429 = 0.7`; Bitvavo's basis stays `499.81` and is **not** raised to `500.5599`
- [ ] 14.24 Resolve the denomination per row, falling back to the row's own asset **only** where the source demonstrably has no fee-currency column (Kraken spot), never as a global default — Bitvavo proves a per-source default is wrong, since it mixes `EUR` and the asset across its own row types
- [ ] 14.30 Model the "already applied?" convention explicitly per source rather than per row shape. **A zero fee needs no convention**: `gross = net + 0` makes both treatments identical, so the 40 real rows with an explicit `0` — 22 Kraken, 18 Bitvavo — are fully determined and must not be flagged. Reserve pending review for a fee amount that is genuinely **absent**, a different state the data really carries: the same Bitvavo file has `'0'` on 12 deposits and an empty cell on 11 others
- [ ] 14.19 **Bit2Me withdrawals hide the network fee in the gross/net difference.** All 43 differing `Withdrawal` rows record `origen` gross and `destino` net; the difference is the fee paid *in the asset*, while `Moneda de la comisión` says `EUR` in all 45 rows and holds a valuation. Measured unrecorded asset fees: JASMY 220, GIGA 20, HBAR 11.4, XLM 3.9, ADA 2, AI16Z 2, USDC 0.3, XRP 0.0024, ETH 0.0005, BNB 0.0002. Two consequences: a taxable asset disposal is never recorded, and custody attributes the **gross** quantity to the destination, overstating the holding there on every withdrawal. Derive the fee as `origen − destino` when both sides name the same asset. Depends on 14.26 for exact operands, and on 14.24/14.30 for the model it plugs into
- [ ] 14.31 Handle the real negative fee: Bitvavo's promotional row carries `fee = -0.00543739 EUR`, exactly cancelling `quantity × price` so the paid total is `0.00`. It must reduce the basis as a credit and must never become a fee disposal of a negative quantity. `preciseAmountSchema` and the SQL `CHECK` already permit the sign — verified — so the guard belongs in the fee-routing logic. Same row as 14.16
- [ ] 14.30d **`mergeRows` does float arithmetic on fees and can sum different assets.** `Number(acc.fee_amount || 0) + Math.abs(Number(data.fee_amount))` turned `'17.720'` into `'17.72'` in a measured run, and `fee_currency` takes the last leg seen — so two legs with fees in different assets would be added under one label. Use `PreciseAmount`, and refuse to combine mismatched denominations
- [ ] 14.25 Route an in-asset fee to a fee disposal that reduces the lot quantity, and a fiat fee to the basis, with `PreciseAmount` arithmetic throughout and no `number` in the path. This is where 14.24 and 14.30 converge into behaviour
- [ ] 14.32 Add the balance-reconciliation guard: for any source shipping a running-balance column, assert `balance = previous ± amount − fee` holds for every row. This is the method that established Kraken's convention — 8/8, corroborated by Kraken's own documentation — and it is what would catch the exchange changing it
- [ ] 14.33 Verify 14.23 and 14.29 pass, and assert no path deducts a fee the source had already applied, nor routes an in-asset fee to the basis

### 14δ. Leg integrity — a movement's two sides survive to the domain

Ordered after the fee model because 14.19 already establishes how a row carrying both sides is read,
and 14.3 changes what `mergeRows` receives, which 14.30d touches.

- [ ] 14.1 Write tests: a same-asset opposing-sign group is not merged; a genuine fiat/crypto trade still is; a merged record never has `asset_in === asset_out`; the classifier receives each leg's own signed amount
- [ ] 14.2 Guard `aggregateRows()` against same-asset opposing-sign groups, leaving genuine trade merging untouched. Note the two guards already shipped — removing `group`/`grupo` from `group_id`'s patterns, and keying the merge on identifier **and** instant — restored 706 → 706 rows on the real Bit2Me files; this task closes the remaining same-asset case
- [ ] 14.19b **DECIDED — normalise in the anti-corruption layer: a custody movement persists exactly one directional side.** All 42 Bit2Me `Deposit` rows carry `origen` and `destino` with the same asset **and** amount. Confirmed by reading the SQL: `v_custody_movements`'s `legs` CTE is a `UNION ALL` of the OUT and IN sides, so such a row yields **two** legs on the same account, netting to zero against the same synthetic counterparty — the deposit lands nowhere and nothing flags it, because there is no imbalance to flag. 34 rows are EUR and genuinely harmless (`NOT IN (SELECT id FROM fiat_assets)` drops both legs); **8 are crypto** — HBAR ×4, USDC, XRP, ETH, ADA. The rule: a deposit keeps `amount_in = destino` and drops the OUT side; a withdrawal keeps `amount_out = destino` (the net moved) with the fee as `origen − destino` in the asset, and drops the IN side. That unifies Bit2Me with the `gross = net + fee` model of 14γ. Compensating in the DuckDB view was rejected: the view must read an already-normalised ledger, or the knowledge that one source duplicates sides ends up buried in SQL and repeated for the next such source
- [ ] 14.3 Move direction resolution ahead of aggregation in the ingestion pipeline, so `classifyCustodyMovement` reads a field no later step removes. Today `aggregateRows()` runs first and `mergeRows()` destructures away the `amount` the classifier needs, so the classifier returns `UNCLASSIFIED` for exactly the case it was built for
- [ ] 14.4 **DECIDED — aggregation moves behind the ingestion boundary.** The frontend sends the rows as the source wrote them; the backend classifies first and aggregates after. Its current position in a frontend composable is the reason the backend never receives two legs, which is what made the recorded-counterparty tier unreachable. Moving it also makes re-ingesting the same file deterministic server-side instead of depending on a frontend version, and takes `generateIdHash` off a client-computed, already-merged record. Includes reordering aggregation after classification (14.3) and reworking the idempotency key
- [ ] 14.5 Verify 14.1 passes, and add a regression test driving a two-row same-asset Kraken group end to end

### 14ε. The recorded-counterparty tier stops being unreachable

Strictly after 14δ: while the merge happens in the frontend there are no two legs to link, so this
phase cannot be evaluated before 14.3 and 14.4.

- [ ] 14.6 Write tests: two legs sharing a source group id resolve to each other; an ambiguous group falls through to synthetic; a single-leg group does not pair
- [ ] 14.7 Populate `spot_transactions.transfer_group_id` from the source's own reference at ingestion — Kraken's `refid` and equivalents — extending `LedgerSpotTransaction` and the port surface
- [ ] 14.8 **DECIDED — populate it from the source reference, guarded; the tier stays.** With 14.4 moving aggregation to the backend the tier becomes reachable, so removing it would discard information the source does give. The merge rule is: legs naming **different** assets merge into one transaction; legs naming the **same** asset persist separately and share the `transfer_group_id`. The guard is what prevents repeating D20: at ingestion, validate that the identifier behaves like a reference — same instant, at most two legs. A group spanning 499 rows across three years is not a reference, and is ignored as a link, neither merging nor pairing. A synthesised backend identifier was rejected: it derives from the same source reference, so it inherits its reliability while losing direct traceability to the file, and still needs the guard
- [ ] 14.9 Verify 14.6 passes and that `v_lot_custody_allocation` attributes a recorded pair to the real destination rather than to `ownwallet-<ASSET>`

### 14ζ. The ledger can state "unknown" for a fiat magnitude

Last of the implementation phases: it is a migration reopening a table group 4 rebuilt, and it
touches `v_flattened_fifo_events`, which 14.25 also modifies. Doing it after the fee model avoids
migrating the same view twice.

- [ ] 14.10 Write tests: an unresolvable magnitude is distinguishable from `0`; a genuinely free acquisition stays `0` and is not reported pending; a negative magnitude is still rejected. Mirrors 14.30b's zero-versus-absent distinction, one layer down
- [ ] 14.11 Add a migration making `total_fiat` and `price_fiat` nullable while keeping the non-negative `CHECK` on non-null values
- [ ] 14.12 Propagate nullability through `nonNegativePreciseAmountSchema`, `LedgerSpotTransaction`, `SQLiteLedgerAdapter`, and `v_flattened_fifo_events`'s `has_recorded_fiat` derivation
- [ ] 14.13 **DECIDED — the columns become nullable; migration `005`.** The same table already treats `fee_amount` as nullable-with-CHECK while the fiat magnitudes are `NOT NULL`, so this aligns an inconsistency inside one table rather than inventing a pattern. And it follows the rule settled for fees: `0` means "genuinely free", so "unknown" needs its own representation. SQLite cannot drop a `NOT NULL` with `ALTER`, so `005` rebuilds the table as `004` did, and group 4's tests need updating. The alternative — amending the spec to "recorded as `0` and reported as pending" — was rejected because the distinction would live only in an ingestion counter and a SQL derivation, never in the recorded fact
- [ ] 14.14 Verify 14.10 passes and that no downstream reader treats a `NULL` magnitude as zero

### 14η. The fidelity net and closing out

- [ ] 14.27 Add the **quantity-level regression net**: a fixture per real export shape — Kraken spot, Kraken futures, Bitvavo, Bitunix, Bit2Me, Tangem — driven through the real parser and normalizer, asserting every amount, fee, and fee denomination **digit for digit**. Last among the implementation work because it asserts the end state of every phase above. Together with 14.18 these are the two nets covering what the suite missed and the user's reading found
- [ ] 14.28 Verify 14.27 passes, and assert no `number` appears in any monetary or quantity path from parser to ledger
- [ ] 14.21 Remove the three `any` occurrences in `MarketDataAdapters.test.ts`'s WebSocket double, or record why a third-party class mock is exempt
- [ ] 14.22 ~~Re-run 13.1, 13.7, 13.11, 13.14 after 14a–14c~~ — **superseded**: group 14 now runs before group 13, so group 13 is the single verification gate and needs no second pass
- [ ] 14.35 ~~Update the docs with the outcome of every decision~~ — **all six were settled before implementation began**: 14.4, 14.8, 14.13, 14.16, 14.17 and 14.19b each carry their verdict and the rejected alternatives inline, and the reasoning is in `design.md` D25. What remains is to record any deviation discovered while implementing them
- [ ] 14.36 Open the follow-up change for **futures collateral**, per the 14.17 decision: a table separate from both `spot_transactions` and `futures_transactions` holding account, movement type, currency, signed amount, spread and instant, plus a per-currency balance view. Scope note for it: spot and futures must never mix, futures never holds the asset, and only the currency movements and PnL matter

## 13. End-to-End Verification (the final gate — runs AFTER group 14)

Group 14 lands first: this group verifies the finished system, and 13.3 and 13.5 are blocked by
defects group 14 repairs. Task numbering is historical, not an execution order.

- [ ] 13.1 Run the full suite: `pnpm exec turbo run test`
- [ ] 13.2 Add a migration integration test applying `004` to a ledger pre-seeded with the exact baseline defects, asserting: empty transactional/derived tables, preserved vault and `user_settings`, correct `is_fiat` seeding, and `needs_recalculation = 'true'`
- [ ] 13.3 Add a CSV fixture reproducing a Kraken export **including the `wallet` column** (spot and earn rows), and an end-to-end test driving it through the real parser → ingestion → automatic materialisation, asserting materialisation fired exactly once
- [ ] 13.4 Assert against the baseline figures on the fixture ledger: no lot derived from a crypto `DEPOSIT`; XRP lot count equals genuine XRP acquisitions only; zero orphan lots and events
- [ ] 13.5 Assert Σ `gain_loss_fiat` over non-`FEE` events is `0` for a sale-free fixture, and that a `WITHDRAWAL` produces no positive gain
- [ ] 13.6 Assert every lot has non-negative `unit_cost_fiat`, and that a `CLOSED` lot serialises as `CLOSED` end to end while an untouched one serialises as `OPEN`
- [ ] 13.7 Assert custody balances reconcile per account, and that `Kraken:spot` vs `Kraken:earn` attribution is correct with the venue roll-up preserved
- [ ] 13.8 Assert the `CUSTODY_RESIDUAL` fee-scale tolerance behaves as specified: within tolerance → no flag; beyond → low-severity flag; negative balance → `UNTRACKED_INFLOW` at high severity. Record the chosen tolerance basis in `design.md`
- [ ] 13.9 Assert the data-quality view reports `MISSING_PRICE` for unpriced `STAKING`/`AIRDROP` acquisitions and `CURRENCY_MISMATCH` for USD/EUR rows, with a non-zero pending-review count that blocks nothing
- [ ] 13.10 Assert assigning a manual price clears the flag, is marked manual in the audit trail, and survives a rebuild and a re-ingestion of the same fixture
- [ ] 13.11 Assert declaring a destination for an `ownwallet-<ASSET>` movement redirects custody and decreases the residual
- [ ] 13.12 Assert `getSpanishTaxReport` reflects the corrected figures for the fixture years, including the excluded-flagged-row count
- [ ] 13.13 Run `openspec validate fix-fifo-transfer-traceability` and `scripts/check-domain-isolation.sh`
- [ ] 13.14 Grep the touched files for `: any`, `as any`, and `<any>` and confirm zero occurrences; confirm every new identifier field uses a branded type and every monetary field uses `PreciseAmount`
- [ ] 13.15 Confirm no `repositories` folder was introduced, every new adapter is named `*Adapter.ts`, every new use case is free of framework imports, and every new view-specific component is colocated under its view's `components/` directory
- [ ] 13.16 Add a changeset (`pnpm changeset`) documenting the breaking status-enum change, the new `quality_flag` column separate from `flag`, the clean-slate migration, and the superseded IRPF figures
