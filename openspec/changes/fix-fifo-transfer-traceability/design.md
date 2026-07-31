## Context

### Measured current state

Queries against the development ledger (`kryptofolio_ledger.db`, 97 active spot transactions):

```
tx_type distribution        DEPOSIT 32 | STAKING 29 | BUY 29 | WITHDRAWAL 6 | AIRDROP 1
SELL / SWAP transactions    0
TRANSFER_IN / TRANSFER_OUT  0
materialised tax_lots       96   (64 with unit_cost_fiat = 0)
materialised events         73   (all phantom — no sale exists)
orphan lots / events        5 / 3
negative total_fiat rows    11 of 29 BUY
reported phantom gains      +1.234,46 € from WITHDRAWAL-derived events
```

XRP specifically: 17 lots (13 from `BUY`, 4 from `DEPOSIT`), of which 14 are `CLOSED` — consumed by 5 `WITHDRAWAL` rows that were wallet transfers.

### The eight-defect causal chain

```
 ┌─ ① NORMALIZER ─────────────────────────────────────────────────────┐
 │  TransactionNormalizer.ts:66-70                                    │
 │  "deposit"→DEPOSIT   "withdraw"→WITHDRAWAL                         │
 │  only literal "transfer" → TRANSFER_IN/OUT  ⇒ 0 rows in practice   │
 └────────────────────────┬───────────────────────────────────────────┘
                          ▼
 ┌─ ② FIFO EVENT FILTER ──────────────────────────────────────────────┐
 │  DuckDbAdapter.ts:245 / :264                                       │
 │  NOT IN ('TRANSFER_IN','TRANSFER_OUT','MIGRATION_SWAP')             │
 │  guards types the pipeline never produces                          │
 │    DEPOSIT   (asset_in ≠ NULL) ──▶ ACQUISITION, cost 0 €           │
 │    WITHDRAWAL(asset_out ≠ NULL)──▶ DISPOSAL,    price 0 €          │
 │                                                                     │
 │  DuckDbAdapter.ts:281-288 — fee-disposal branch: NO tx_type filter │
 │  DuckDbAdapter.ts:279-280 — COALESCE(hp.close, 1.0) invents 1,00 € │
 └────────────────────────┬───────────────────────────────────────────┘
                          ▼
 ┌─ ③ SIGN ASYMMETRY ─────────────────────────────────────────────────┐
 │  CsvIngestionUseCase.ts:98/133 — total_fiat NOT .abs()'d           │
 │  (amount_in/amount_out ARE .abs()'d at :127/:129)                  │
 │    BUY 179,11 XRP, total_fiat = -300  ⇒ unit_cost = -1,6724 €      │
 │    gain = (0 − (−1,6724)) × 179,11    ⇒ +299,46 € ⚠️               │
 │  CsvIngestionUseCase.ts:31 — unknown tx_type defaults to 'BUY'     │
 └────────────────────────┬───────────────────────────────────────────┘
                          ▼
 ┌─ ④ READ PATH ──────────────────────────────────────────────────────┐
 │  GetTokenHistoryUseCase.ts:62-67 — recomputes status, discarding   │
 │    the view's OPEN/PARTIAL/CLOSED into FULL/PARTIAL/EMPTY          │
 │  GetTokenHistoryUseCase.ts:108 — operation_type: 'SELL' hardcoded  │
 └────────────────────────┬───────────────────────────────────────────┘
                          ▼
 ┌─ ⑤ UI ─────────────────────────────────────────────────────────────┐
 │  ExpandedLotsTable.vue:52-76 — mapping is INVERTED                 │
 │    remainingQty === 0        → "EMPTY" → lot_status.open  🟢profit │
 │    remainingQty === original → "FULL"  → lot_status.sold          │
 │  14 closed XRP lots read "ABIERTO" green; 2 open ones read "VENDIDO"│
 └────────────────────────┬───────────────────────────────────────────┘
                          ▼
 ┌─ ⑥ MATERIALISER ───────────────────────────────────────────────────┐
 │  FifoMaterializerService.ts:73-74 — UPSERT only, never DELETE      │
 │  ⇒ 5 orphan lots + 3 orphan events survive every rebuild forever   │
 └─────────────────────────────────────────────────────────────────────┘
```

### Prior art surveyed

**Wealthfolio** ([activity-types.md](https://github.com/wealthfolio/wealthfolio/blob/main/docs/activities/activity-types.md)) is the closest existing model: `TRANSFER_OUT` → *"Holdings: decreases quantity; lots reduced using FIFO"*, `−cost_basis (account scope)`; `TRANSFER_IN` → `+quantity (new lot)`, `+cost_basis (account scope)`; fees on transfers → *"`−fee` only"*, affecting cash but not holdings or basis; `is_external = false` makes internal transfers *"net to zero at portfolio level"*.

**Ghostfolio** ([discussion #1899](https://github.com/ghostfolio/ghostfolio/discussions/1899)) has no custody model. Its documented workaround is a `SELL` on the origin account plus a `BUY` on the destination at the same price, acknowledged to *"mess up some performance charts"* — this is byte-for-byte the defect described above.

**What we adopt:** cost-basis carry-over across accounts, and fees that do not alter the cost basis.

**What we reject:** Wealthfolio's `account scope` lot identity. Creating a new lot on `TRANSFER_IN` dates it at the transfer instant. Global per-asset FIFO orders by acquisition date, so a lot bought in December that "reappears" in March silently **reorders the taxation queue as a side effect of a non-taxable event**. Correct for a net-worth tracker; wrong for an IRPF declaration.

### Constraints

- **Spanish IRPF** mandates global per-asset FIFO. Matching must not be partitioned by account, so custody has to be modelled *alongside* FIFO, never inside it.
- **The existing spec is already correct.** `spot-fifo-tax-calculator` requires that `TRANSFER_OUT` **or `WITHDRAWAL`** be ignored for tax purposes while the fee is still extracted. This change makes the implementation obey its own contract.
- **Hexagonal purity.** Classification is a pure function in `packages/core-domain/src/domain/`; SQL lives in infrastructure adapters; orchestration lives in application use cases; the FIFO and custody math stays in DuckDB.
- **Precision.** All monetary arithmetic through `PreciseAmount` / `decimal.js`; SQLite stores TEXT with GLOB CHECKs, so DuckDB must emit `PRINTF`-formatted strings. No `any`, no raw `number` in financial positions.
- **Push math down.** Custody allocation, balance derivation, and reconciliation diffing are SQL (recursive CTEs, window functions, `QUALIFY`, `ASOF JOIN`), not JavaScript loops.
- **Development phase.** No production deployment; all source CSVs are re-ingestable. This is treated as licence to choose the correct model over the migratable one.

## Goals / Non-Goals

**Goals:**

- Custody movements between the user's own accounts produce no acquisition, no disposal, and no lot mutation — while their crypto network fee still produces a disposal, per the existing spec.
- Every lot is traceable across every account it ever occupied, whether or not its quantity is split, for arbitrary durations, with fee drift as a measured residual rather than a matching failure.
- Custody tracking is independent of time windows and amount matching: order-independent, idempotent, and free of heuristics.
- Make the "which tx_type does what" decision impossible to drift: one typed constant, one SQL relation, zero inline type lists.
- Missing market data is visible and manually assignable, never silently valued at `0` or `1.0`, and never blocking.
- Manual corrections are inputs to the calculation that survive every rebuild.
- Fiat magnitudes are non-negative by construction, enforced at the CHECK-constraint level.
- One lot-status vocabulary from SQL through to the badge.
- Rebuilds are automatic, idempotent, and converge: orphan and phantom rows retire.

**Non-Goals:**

- Multi-currency conversion (USD↔EUR). Detected and flagged only — owned by `market-data-fiat-normalization`.
- Automated historical price backfill — owned by `historical-price-storage`. This change surfaces gaps and provides manual assignment.
- Changing the FIFO matching algorithm itself. The cumulative-interval-overlap join in `v_fifo_matches` is correct and stays.
- Per-account (venue-scoped) taxation FIFO. Global FIFO is legally required and retained.
- Futures / derivatives P&L. Untouched.
- Preserving existing ingested data. Clean slate plus re-ingestion is the chosen path.

## Decisions

### D1 — Policy relation instead of inline `NOT IN` lists

`FIFO_EVENT_POLICY: Record<SpotTxType, FifoEventPolicy>` in `@kryptofolio/shared-types`, materialised at DuckDB bootstrap into a `fifo_event_policy` table; each `UNION ALL` branch of `v_flattened_fifo_events` joins it and filters on the relevant boolean.

```
        FIFO_EVENT_POLICY  (Record<SpotTxType, …> — compile-time exhaustive)
                    │
                    │  seeded once at bootstrap (single multi-row INSERT)
                    ▼
        ┌───────────────────────────────────────────────┐
        │  fifo_event_policy (DuckDB)                   │
        │  tx_type │ acq │ disp │ fee_disp │ taxable    │
        ├──────────┼─────┼──────┼──────────┼────────────┤
        │ BUY      │  ✓  │      │    ✓     │            │
        │ SELL     │     │  ✓   │    ✓     │     ✓      │
        │ SWAP     │  ✓  │  ✓   │    ✓     │     ✓      │
        │ SPEND    │     │  ✓   │    ✓     │     ✓      │
        │ STAKING  │  ✓  │      │    ✓     │            │
        │ AIRDROP  │  ✓  │      │    ✓     │            │
        │ REWARD   │  ✓  │      │    ✓     │            │
        │ MINING   │  ✓  │      │    ✓     │            │
        │ FEE      │     │  ✓   │    ✓     │     ✓      │
        │ DEPOSIT  │     │      │    ✓     │            │  ← was ACQUISITION
        │ WITHDRAWAL│    │      │    ✓     │            │  ← was DISPOSAL
        │ TRANSFER_IN│   │      │    ✓     │            │
        │ TRANSFER_OUT│  │      │    ✓     │            │
        │ MIGRATION_SWAP│ │     │    ✓     │            │
        └───────────────────────────────────────────────┘
                    │
                    ▼  JOIN, one boolean per branch
        v_flattened_fifo_events   (no tx_type literals anywhere)
```

*Why:* the defect is structural — the same predicate was written three times and one copy was forgotten. A relation makes the branch condition a single column read, and `Record<SpotTxType, …>` makes a new transaction type a compile error rather than a silent leak.

*Alternatives rejected:*
- **Fix the three `NOT IN` lists in place.** Cheapest, but preserves the exact drift mechanism that produced the bug.
- **A DuckDB macro / UDF.** Less inspectable, cannot be asserted by a "no literals in view text" test, no compile-time exhaustiveness.

### D2 — `is_fiat` on assets, not a hardcoded currency list in SQL

`DEPOSIT`/`WITHDRAWAL` are genuinely ambiguous: 500 EUR into Kraken is fiat funding; 179 XRP into a wallet is custody. Both share the type. Resolving by asset classification handles both, and keeps the classification as data rather than as a second symbol list embedded in SQL.

### D3 — One immutable lot per acquisition; custody is a separate concern

The lot row is the fiscal fact fixed at acquisition: `original_qty`, `unit_cost_fiat`, `acquisition_timestamp`, acquiring venue. It is never split, never re-dated, never relocated. Custody is a distinct, append-only projection over accounts and time.

```
   BUY 179,11 XRP @ 1,6724 €   ┌──────────────────────────────────┐
   on Kraken:spot, 2025-12-15 ▶│ tax_lots  (IMMUTABLE ECONOMICS)  │
                               │  original_qty       179,11       │
                               │  unit_cost_fiat     1,6724       │
                               │  acquisition_ts  2025-12-15      │ ← fija el orden FIFO global
                               │  exchange_location Kraken:spot   │ ← venue de ADQUISICIÓN
                               │  status             OPEN         │
                               └────────────────┬─────────────────┘
                                                │
                          custody distributed, lot row untouched
                                                │
                  ┌─────────────────────────────┴──────────────────┐
                  ▼                                                ▼
        Binance  100,00                                ownwallet-XRP  79,11
```

*Why not split the lot on partial transfer:* it multiplies lot rows, and a new lot row implies a new position in the global FIFO queue — meaning a non-taxable event would change which lot a future sale consumes. That is the same class of error as Wealthfolio's account-scoped re-lotting.

### D4 — Custody as a double-entry ledger with `ownwallet-<ASSET>` as default counterparty

**Superseded approach:** an earlier draft paired outbound and inbound legs by a 72-hour window plus a fee-adjusted amount band. That is discarded. Pairing heuristics fail exactly where tracking matters most: self-custody spanning years exceeds any window, fees break amount equality, and two same-asset transfers in succession can cross-match.

**Chosen approach:** every custody-relevant leg emits balanced entries. When the counterparty is unknown it resolves to a synthetic per-asset account `ownwallet-<ASSET>`, which serves as both sink and source. No pairing exists to fail.

```
  CUSTODY LEDGER — per asset, double entry, zero heuristics
  ═══════════════════════════════════════════════════════════════════

  WITHDRAWAL 179,11 XRP from Kraken:spot     (destination unknown)
        Kraken:spot        −179,11
        ownwallet-XRP      +179,11    ◀── default sink
        Kraken:spot        −  0,20    ◀── fee: disposed, leaves custody

  DEPOSIT 178,91 XRP into Ledger             (source unknown)
        ownwallet-XRP      −178,91    ◀── default source
        Ledger             +178,91

  TRANSFER_OUT 100 XRP Ledger → Binance      (destination known)
        Ledger             −100,00
        Binance            +100,00
  ───────────────────────────────────────────────────────────────────
  ownwallet-XRP residual:  +0,20     ◀── the measurable fee margin
```

Properties this yields that the pairing rule did not:

| | Pairing by time/amount | Double-entry with `ownwallet-<ASSET>` |
|---|---|---|
| Withdrawal with no visible deposit | `UNPAIRED`, custody lost | accumulates in `ownwallet-XRP`, traceable |
| Self-custody for years | window expires, link lost | irrelevant, the balance persists |
| Two same-asset transfers in succession | cross-match risk | impossible, these are balances |
| Network fees | break the amount match | remain as a measurable residual |
| Order dependence | yes, result varies with processing order | no, it is a sum |
| Idempotent across rebuilds | not guaranteed | guaranteed |

**Residual semantics are diagnostic, and the sign matters:**

- **Positive** `ownwallet-<ASSET>` balance → crypto left known accounts and has not reappeared. Either genuinely self-custodied (correct), or an unrecorded network fee. Flagged `CUSTODY_RESIDUAL` at low severity when it exceeds the fee-scale tolerance.
- **Negative** `ownwallet-<ASSET>` balance → more crypto arrived than ever left. Something entered from an unrecorded source, so a holding exists with **no cost basis**. Flagged `UNTRACKED_INFLOW` at high severity. This is the fiscally dangerous case and the old pairing model could not express it at all.

*Alternative rejected:* pairing in the Node application layer. It is an O(n²) candidate join, and it retains every heuristic failure mode while moving the work off the columnar engine.

### D5 — Custody allocation FIFO is not taxation FIFO

Two independent orderings, deliberately never merged:

```
  TAXATION FIFO                        CUSTODY ALLOCATION FIFO
  ─────────────────────────────        ────────────────────────────────
  scope:  global per asset             scope:  per (account, asset)
  orders: acquisition_timestamp        orders: acquisition_timestamp
  drives: which lot a SALE consumes    drives: which lot's quantity MOVES
  effect: fiscal — gain/loss           effect: none — attribution only
  impl:   v_fifo_matches (unchanged)   impl:   v_lot_custody_allocation
```

When 100 XRP leave `Kraken:spot`, the quantity is drawn from the oldest lots *currently custodied in `Kraken:spot`*. This resolves which lot moved; it never alters `remaining_qty`, never emits a `lot_history_event`, and never touches the taxation queue.

*Implementation:* custody allocation is genuinely sequential — each movement's allocation depends on all prior allocations for that account — so the cumulative-interval trick used by `v_fifo_matches` does not apply. This is the canonical `WITH RECURSIVE` case, using DuckDB's `USING KEY` to overwrite intermediate state rather than accumulate it.

### D5b — Data-quality flags are a new column, not a reuse of `flag`

`lot_history_events.flag` is already live with a different meaning: `WALLET_ACTIVATION`, produced by `TangemCsvParser` and consumed by `useTaxCalculations.ts:160`, `LotEventHistory.vue:30`, `TaxTransactionsTable.vue:133` and three test files, for the AEAT audit trail. Reusing that column for data-quality defects would delete a working fiscal feature.

```
   flag          — FISCAL CLASSIFICATION   (existing, preserved)
                   WALLET_ACTIVATION, …    "what kind of operation is this"

   quality_flag  — DATA QUALITY            (new)
                   MISSING_PRICE, CURRENCY_MISMATCH,
                   CUSTODY_RESIDUAL, UNTRACKED_INFLOW,
                   CUSTODY_IMBALANCE, NEGATIVE_COST_BASIS,
                   ORPHAN_LOT, UNKNOWN_TX_TYPE
                                           "what is wrong with its numbers"
```

*Why two columns:* the concerns are orthogonal and co-occurring. A wallet-activation operation whose price cannot be resolved must carry both values. A single column forces a precedence rule that loses information, and `useTaxCalculations.ts` already encodes such a precedence (`WALLET_ACTIVATION` → exempt → gain/loss) which would silently start masking valuation defects. A unit test asserts the two vocabularies share no member.

### D6 — `NULL` propagation, never a fabricated price

Remove `COALESCE(hp_fee_dis.close, 1.0)` and `COALESCE(hp.close, 0.0)`. An unresolvable price yields `sale_price_fiat = NULL`, `gain_loss_fiat = NULL`, `is_taxable = 0`, `quality_flag = 'MISSING_PRICE'`.

*Why:* `COALESCE(price, 1.0)` is the worst possible failure mode — it produces a plausible number. A €1,00/unit XRP fee looks like data. `NULL` cannot be summed into a tax base by accident.

*Why keep the event rather than filter it out:* a dropped event is invisible; the user cannot tell whether their fee was untaxed or forgotten. Present-but-flagged-and-excluded is auditable and reviewable.

### D7 — Manual overrides are calculation inputs, not edited outputs

Persisting derived data alongside user edits in the same table means reconciliation destroys the user's work on the next rebuild. The separation is structural:

```
   INPUTS (user-authored)                  OUTPUTS (derived)
   never touched by reconciliation         recomputed and reconciled
   ┌──────────────────────────────┐        ┌───────────────────────────┐
   │ manual_price_overrides       │        │ tax_lots                  │
   │ transfer_destination_        │        │ lot_history_events        │
   │   overrides                  │        │ lot_custody_entries       │
   └───────────────┬──────────────┘        └────────────▲──────────────┘
                   │                                     │
                   │         ┌──────────────────┐        │
                   └────────▶│   DuckDB         │────────┘
   spot_transactions ───────▶│  single engine   │
   accounts / assets  ──────▶└──────────────────┘
```

The user never edits `lot_custody_entries`. They declare *"the price of this `STAKING` receipt is 0,42 €"* or *"this withdrawal went to my Ledger, not to `ownwallet-XRP`"*, and DuckDB recomputes from that input.

*Consequences:* DuckDB remains the only calculation engine, with no logic duplicated in TypeScript. Reconciliation can freely delete and rebuild outputs. Overrides survive rebuilds, re-ingestion, and future policy changes. And provenance is preservable — the audit trail can mark a value as manually assigned rather than market-sourced.

*Alternative rejected:* allow editing the derived rows and exclude edited rows from reconciliation via a `is_manually_edited` flag. This makes reconciliation stateful and order-dependent, and produces derived tables that are no longer a pure function of their inputs.

### D8 — Automatic rebuild, per batch, orchestrated in the application layer

```
  route  POST /api/transactions/ingest
    │
    ▼
  IngestAndMaterializeUseCase              ◀── application layer orchestrator
    ├── CsvIngestionUseCase.execute(rows)      (per-row, network-bound)
    └── FifoMaterializerService.recalculate()  (ONCE per batch)

  route  POST /api/portfolio/rebuild       ◀── explicit retry, unchanged
  route  PUT  /api/fiscal/overrides/*      ◀── triggers immediate rebuild
```

*Why per batch, not per row or per file:* `CsvIngestionUseCase` already performs a network `getHistoricalPrice` per transaction. A rebuild per row would multiply a full FIFO recompute by N. One pass at batch close is a single recompute.

*Why a new orchestrator use case rather than injecting the materialiser into `CsvIngestionUseCase`:* each use case stays single-purpose and independently callable as an LLM tool. The orchestrator is the impure shell of the Functional Sandwich; ingestion and materialisation remain the composable steps.

*Why `needs_recalculation` survives:* it is reframed from "the user must press Sync" to "work is pending". A failed automatic rebuild leaves it `true`, so the flag becomes the retry signal and the UI's pending indicator. It is cleared only inside the successful transaction.

*Why an override edit triggers an immediate rebuild:* it is a single deliberate user action with a small blast radius, and the user expects to see the effect of the value they just assigned.

### D9 — Account hierarchy and synthetic accounts

`accounts.parent_account_id` gives exchange sub-wallets first-class identity (`Kraken:spot`, `Kraken:earn`, `Kraken:futures`), so blocked-in-staking balance is distinguishable from free balance. `accounts.is_synthetic` marks `ownwallet-<ASSET>` accounts.

```
  accounts
  ────────────────────────────────────────────────────────────────
  Kraken              parent=NULL   synthetic=0   ◀── venue
   ├─ Kraken:spot     parent=Kraken synthetic=0
   ├─ Kraken:earn     parent=Kraken synthetic=0   ◀── staked balance
   └─ Kraken:futures  parent=Kraken synthetic=0
  Ledger              parent=NULL   synthetic=0
  ownwallet-XRP       parent=NULL   synthetic=1   ◀── custody math only,
  ownwallet-BTC       parent=NULL   synthetic=1       hidden from selectors
```

Synthetic accounts participate fully in custody arithmetic and are excluded from user-facing account selectors and from account-count metrics. Global taxation FIFO is unaffected — it ignores account entirely.

`KrakenSpotCsvParser` must start reading the `wallet` CSV column it currently discards. Because that column was never persisted, sub-wallet identity cannot be derived retroactively for existing rows — which is one of the reasons the clean slate of D12 is the right call rather than a concession.

### D10 — Signed values are a modelling error; magnitudes plus `tx_type`

`total_fiat` and `price_fiat` become non-negative, enforced by SQLite CHECK. Direction is carried by `tx_type` + `asset_in_id`/`asset_out_id`, which is already how `amount_in`/`amount_out` work. The ingestion code already `.abs()`-es quantities at `CsvIngestionUseCase.ts:127/129` but not fiat at `:98/:133`; the asymmetry, not the sign convention, is the bug. Making it a constraint means no future parser can reintroduce it.

*Alternative rejected:* `ABS()` defensively inside the views. Hides corruption in the ledger, so other consumers (`DuckDbMetricsAdapter`) still read negative costs.

### D11 — Negative basis is a defect, not an input

Even after constraints, a negative or zero basis reaching the matcher is suppressed: flag the lot, emit matched disposals with `is_taxable = 0`, never report a gain derived from it.

*Why:* defence in depth. The precise failure mode here — `gain = (0 − (−1,6724)) × 179,11 = +299,46 €` — turned two independent bugs into a *confident wrong answer*. The engine must refuse to compute rather than produce a number it cannot justify.

### D12 — Clean-slate migration instead of repair and backfill

Migration `004` performs additive DDL and then purges transactional and derived ledger data. Source CSVs are re-ingested afterwards.

*Why:* re-ingestion is required regardless — the Kraken `wallet` column needed for D9 was never persisted and cannot be recovered. Given that, carrying an `ABS()` repair path, an ambiguous `disposal_type` backfill, and a period where two account-identity models coexist would be complexity in service of data that is about to be replaced. The clean slate removes an entire defect surface and makes the migration trivially verifiable.

*What is preserved:* the vault, `user_settings`, and schema-migration history. Only transactional and derived data is purged.

*Alternative rejected:* in-place repair. Correct in production, but here it buys nothing and costs three tasks of one-off logic plus its tests.

### D13 — Set reconciliation replaces UPSERT-only materialisation

Diff the recomputed set against the materialised set inside one SQLite transaction: insert new, update changed, soft-delete absent, reactivate returning. Scoped strictly to derived tables (`tax_lots`, `lot_history_events`, `lot_custody_entries`). Returns a structured `{inserted, updated, retired, reactivated, flagged}` summary.

*Why:* deterministic IDs (`md5(id_hash || '_' || asset_id)`) already make the recomputed set a total function of the ledger. Without the delete arm, materialisation is monotonic — which is why 5 orphans persist and why the ~80 phantom lots would survive this very fix.

*Why soft-delete:* the ledger's non-destructive audit policy and existing `v_active_*` views already assume it.

*Why one transaction:* a half-reconciled ledger would present orphan events referencing missing lots. `needs_recalculation` is cleared only on success.

### D14 — One status vocabulary: `OPEN | PARTIAL | CLOSED`

`TAX_LOT_STATUSES` already exists in shared-types, is already the SQL CHECK constraint, and is already what `v_calculated_tax_lots` emits. `FULL | PARTIAL | EMPTY` is a parallel vocabulary invented in `GetTokenHistoryUseCase` and mirrored into the DTO layer.

The inversion is worth stating precisely, because the naming is what let it survive review:

```
   backend meaning          UI mapping today            correct
   ───────────────────────────────────────────────────────────────
   FULL  = untouched   →   lot_status.sold  "VENDIDO"  →  OPEN
   EMPTY = consumed    →   lot_status.open  "ABIERTO"  →  CLOSED
                           + badge variant "profit" 🟢
```

`FULL` reads as "fully sold" and `EMPTY` as "empty of sales" to anyone who did not write the enum. Deleting the vocabulary is the fix; renaming it would leave the trap.

### D15 — Provenance as data: `disposal_type`

`DISPOSAL_TYPES = ['SELL','SWAP','FEE','SPEND']` on `lot_history_events`, derived in the view from the source `tx_type` and the emitting branch. Replaces `operation_type: 'SELL'` hardcoded at `GetTokenHistoryUseCase.ts:108`.

*Why:* this hardcode is the second, independent reason the user sees "everything as sales". Even once the phantom events are gone, surviving fee disposals would still render as `SELL`.

### D16 — Fail loudly on unknown transaction types

`toSpotTxType()` currently returns `'BUY'` for anything unrecognised (`CsvIngestionUseCase.ts:31`). Under D1 an unknown type would instead be excluded by the policy join — silently dropping the transaction. Both silent outcomes are wrong: the row is rejected with a named error, and valid rows in the batch still persist.

### D18 — Ports change before adapters

`ITaxCalculatorPort` currently declares `calculateLotsAndEvents(): Promise<{lots, events}>`, and `ILedgerPort` declares `upsertTaxLots` / `upsertLotHistoryEvents` — an UPSERT-only contract that structurally cannot express retirement. Both are extended first, so the compiler forces every adapter to conform rather than letting an adapter return data the port never promised.

*Why this ordering matters here specifically:* the reconciliation fix (D13) is impossible to express through the current port surface. Had the adapter been changed first, reconciliation would have leaked into the infrastructure layer as an undeclared side effect — the same class of error as the SQL predicate drift that started this whole investigation.

### D17 — Layer placement

```
 packages/shared-types        FIFO_EVENT_POLICY, DISPOSAL_TYPES,
                              FIFO_QUALITY_FLAGS, TAX_LOT_STATUSES,
                              synthetic-account naming contract        ← single source of truth
        │
 packages/core-domain         custody classification, ownwallet naming
                              (pure functions — no Zod / Vue / Axios)
        │
 packages/database            fifo_event_policy seed, FIFO views,
                              v_custody_entries, v_lot_custody_allocation,
                              v_lot_current_location, v_custody_balances,
                              v_fifo_data_quality
        │
 apps/backend/application     IngestAndMaterializeUseCase   (orchestrator)
                              CsvIngestionUseCase            (sign, strict map, sub-accounts)
                              FifoMaterializerService        (reconciliation, pure summary)
                              SetManualPriceOverrideUseCase
                              SetTransferDestinationUseCase
                              GetTokenHistoryUseCase         (pass-through status + provenance)
        │
 apps/backend/infrastructure  SQLiteLedgerAdapter, DuckDb*Adapter, routes
        │
 apps/frontend/infrastructure Zod DTOs — canonical enums, parseOrFail → errorBus
        │
 apps/frontend/views          ExpandedLotsTable, LotEventHistory,
                              PendingValuesReview (colocated per FSD),
                              Pinia Colada useQuery / useMutation — no global store
```

Every new use case returns plain data with no HTTP coupling, keeping them directly invocable as LLM tools. Identifiers use branded types; monetary values use `PreciseAmount`; `any` appears nowhere.

## Risks / Trade-offs

**`v_lot_custody_allocation` is the most complex new artefact — a recursive sequential allocation.**
→ It is the canonical `WITH RECURSIVE` case, and DuckDB's `USING KEY` bounds intermediate state. Scheduled as an isolated task with its own fixture before anything depends on it, and benchmarked against `tax_stress_test.spec.ts`. If recursion proves unworkable at scale, the fallback is a bounded iterative allocation materialised at rebuild time — the persisted-table decision already permits that without changing any consumer.

**`ownwallet-<ASSET>` could become a dumping ground that hides real problems.**
→ Its balance is a first-class diagnostic, not a void. Positive residual beyond fee scale is flagged `quality_flag = 'CUSTODY_RESIDUAL'`; negative balance is flagged `quality_flag = 'UNTRACKED_INFLOW'` at high severity because it means a holding with no cost basis. Both surface in `fiscal-integrity` with counts.

**Fee-scale tolerance for `CUSTODY_RESIDUAL` is a judgement call and could be noisy or too permissive.**
→ Expressed relative to the asset's recorded fees rather than as an absolute constant, so it scales across assets with very different unit values. Starts advisory-only; tuned against the real re-ingested ledger in the verification group.

**Reported IRPF figures change materially — a sale-free ledger goes from +1.234,46 € to 0 €.**
→ Correction, not regression: the prior figure came from transfers. The rebuild summary reports retired counts and `fiscal-integrity` surfaces what changed and why. The changeset records that previously exported reports are superseded.

**`NULL` propagation could silently zero the tax base if a `SUM` swallows it.**
→ Aggregations filter on `is_taxable = 1` and count flagged rows explicitly; the rebuild summary reports the flagged count so a large number is visible rather than absorbed. Tested with a fixture where all prices are missing.

**Automatic rebuild could surprise the user with long waits after a large import.**
→ One recompute per batch, not per row or file. The rebuild summary is returned with the ingestion response so the wait is accounted for, and `needs_recalculation` keeps a failed run retryable rather than silently lost.

**Automatic rebuild on every override edit could thrash during a bulk manual-review session.**
→ Each edit is a single deliberate action, and the recompute is the same cost as one rebuild. If bulk review proves painful in practice, the mutation surface already supports batching several overrides into one request — no design change needed.

**Sub-wallet accounts multiply account count and could complicate portfolio aggregation.**
→ `parent_account_id` makes roll-up a single grouping, and `is_synthetic` keeps `ownwallet-*` out of user-facing lists and counts. Aggregation queries group by the parent by default.

**Policy join changes FIFO ordering, shifting which lot a genuine sale consumes.**
→ Intended: removing phantom disposals restores the correct ordering. Regression coverage pins expected lot-to-disposal assignments for a fixture containing real sales interleaved with transfers, asserting cost basis per match.

**Clean-slate migration destroys the current development ledger.**
→ Explicitly authorised; there is no production deployment and every source CSV is re-ingestable. Deterministic `id_hash` (once `Math.random()` is removed) makes re-ingestion idempotent. The baseline metrics are captured to a file first so the fix remains provable against measured before/after numbers.

**Breaking the lot-status enum ripples through mock adapters and tests.**
→ The vocabulary lives in `@kryptofolio/shared-types`; mock and real DTO schemas change in the same commit so the port contract stays substitutable. A repo-wide search for `'EMPTY'`/`'FULL'` in status positions is part of the definition of done.

**The frontend `isLotInLoss` heuristic cannot distinguish "cost is 0" from "cost is unknown".**
→ Flagged lots suppress the tax-loss indicator entirely and render a data-quality indicator instead, so the UI never advises on an untrustworthy basis.

## Migration Plan

1. **Contracts** — add `FIFO_EVENT_POLICY`, `DISPOSAL_TYPES`, `FIFO_QUALITY_FLAGS`, and the synthetic-account naming contract to `@kryptofolio/shared-types`; enforce `Record<SpotTxType, …>` exhaustiveness. No behaviour change yet.
2. **Baseline** — record the pre-fix metrics of the current ledger to `baseline.md` as the evidence the fix is verified against.
3. **Schema** — `004_fifo_traceability.sql`: additive DDL (`assets.is_fiat`, `accounts.parent_account_id`, `accounts.is_synthetic`, `lot_history_events.disposal_type`/`flag`, `lot_custody_entries`, `manual_price_overrides`, `transfer_destination_overrides`, non-negative fiat CHECKs), then the clean-slate purge of transactional and derived data, preserving vault, `user_settings`, and migration history.
4. **Engine** — seed `fifo_event_policy`; rewrite `v_flattened_fifo_events` against it; remove fabricated-price `COALESCE`s; add `v_custody_entries`, `v_lot_custody_allocation`, `v_lot_current_location`, `v_custody_balances`, `v_fifo_data_quality`; emit `disposal_type` and `flag`.
5. **Application** — reconciliation in `FifoMaterializerService`; sign normalisation, strict type mapping and sub-account resolution in `CsvIngestionUseCase`; `IngestAndMaterializeUseCase`; override use cases; pass-through status and provenance in `GetTokenHistoryUseCase`.
6. **Anti-corruption + UI** — canonical enums in Zod DTOs (real and mock); Kraken parser reads `wallet` and drops `Math.random()`; fix the inverted status mapping and the loss heuristic; custody display; pending-values review surface; i18n keys.
7. **Re-ingest and verify** — re-import the source CSVs, confirm automatic materialisation fires once per batch, and assert against `baseline.md`: no phantom lots, no non-`FEE` disposals for a sale-free ledger, expected flag counts, and correct sub-wallet attribution.

**Rollback:** revert the code and re-run migrations from scratch, then re-ingest. There is no production data to restore.

## Open Questions

None outstanding. The four questions raised in the first draft are resolved:

- **Transfer pairing heuristics** → eliminated entirely by D4's double-entry model with `ownwallet-<ASSET>`.
- **Unpriceable acquisitions** → flagged and manually assignable per D6/D7; never blocking.
- **Exchange sub-wallets** → first-class child accounts per D9.
- **Custody storage location** → persisted SQLite tables per D7, with DuckDB retained as the sole calculation engine and user overrides separated as inputs.
