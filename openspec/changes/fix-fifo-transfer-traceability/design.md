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

`lot_history_events.flag` is already live with a different meaning: `WALLET_ACTIVATION`, consumed by `useTaxCalculations.ts:160`, `LotEventHistory.vue:30`, `TaxTransactionsTable.vue:133` and three test files, for the AEAT audit trail. It has **no producer** in the running application — `TangemCsvParser` was the only code that ever emitted it and nothing outside tests imports it, so the flag arrives from persisted data alone until the source-format profiles emit it. Reusing that column for data-quality defects would still delete a working fiscal feature: the consumers are live even though the producer is not.

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

### D16b — The mapper must not overrule the domain's refusal

D16 removed the `?? 'BUY'` default but left `TRADE: 'BUY'` and `TRANSFER: 'TRANSFER_IN'` in the same table, and the futures mapper kept both a `?? 'TRADE'` default and `TRANSFER: 'TRADE'`. All four name an operation without naming its direction.

That matters because of where they sit. `TransactionNormalizer` keeps a movement's raw lowercase label exactly when `classifyCustodyMovement` declined to resolve a direction, so a label like `transfer` arriving at the backend *carries that refusal*. Mapping it anyway means the outermost layer silently overrules the only layer entitled to decide — the same shape as the original bug, where a withdrawal became an acquisition because something downstream guessed.

All four are removed. Directional forms (`transfer_in`, `transfer_out`, `buy`, `sell`) are unaffected, and every canonical futures type still maps to itself through the early `includes` check. A futures `transfer` is rejected rather than recorded as a `TRADE`, because a margin movement is custody and recording it as a trade invents a position that was never opened.

### D19 — Aggregation before classification is the root of the multi-leg gap

`useImportProcessor` calls `aggregateRows()` and *then* `normalizeTransactionDirection()`. `mergeRows()` destructures `amount` and `asset` out of the merged record and redistributes them into `amount_in` / `amount_out`, so by the time the classifier runs, the field it reads to determine direction no longer exists.

Consequences, all measured:

1. For a same-asset opposing-sign group the merged record has `asset_in === asset_out` — a transaction that both spends and receives the same asset.
2. `classifyCustodyMovement` returns `UNCLASSIFIED` for it, the normalizer keeps the raw label, and the backend mapper used to supply a direction anyway. With D16b that row is now rejected loudly instead, which is the correct interim state.
3. Because the merge happens in the frontend, the backend never receives two legs, so `transfer_group_id` has no pair to record and the `recorded_counterparty` tier of `v_custody_movements` is unreachable by construction.

The real Kraken export contains **zero** same-asset opposing-sign groups — all ten of its multi-row `refid` groups are genuine trades — so via *Kraken* this is latent. **Via Bit2Me it was not**, see D20.

### D20 — A shared group identifier is not evidence of one operation

`COLUMN_DICTIONARY` mapped `group` and `grupo` onto `group_id`, the field `aggregateRows()` merges on. Bit2Me's export header is `Grupo`, and its values are **wallet compartments** — `earn`, `trading`, `pocket`, `blockchain`, `bank-transfer` — so an entire multi-year history shares five values.

Measured on the real files by driving all 706 rows through the actual aggregator:

| | before | after |
|---|---|---|
| rows out | **5** | 706 |
| Σ `amount_in` | 173 504 | 204 274 |

706 rows collapsed into five transactions, each keeping only the first row's quantity: 499 staking rewards became one record of 0.0789 B2M. **~99% silent data loss on real production input**, and it is the same class of error as the `wallet` → `account_id` collision group 8 fixed — a column read as the wrong concept.

Two independent guards, because either alone is insufficient:

1. `group` / `grupo` are removed from `group_id`'s patterns and `grupo` is added to the metadata `wallet` patterns, where Kraken's equivalent column already goes. That alone restores 706 → 706, and it also feeds `deriveSubAccountId`, which had no Bit2Me input at all before.
2. `aggregateRows()` keys on the identifier **and the instant**. The legs of a genuine trade are recorded at the same moment — verified: all ten Kraken `refid` groups share an exact timestamp — while rows that merely share a category do not. This is defence in depth for any future source with a category-like group column.

Guard 2 alone was measured as **insufficient**: Bit2Me's timestamps have minute resolution, and 19 `(grupo, minute)` keys still held 71 rows — six distinct USDT trades in one minute, two staking rewards in different assets in another. The dictionary fix is what actually solves it.

### D21 — Bit2Me encodes a movement's fee as the gross/net difference, not as the fee column

An earlier draft of this section claimed Bit2Me's 87 movement rows all carry the same asset *and the same amount* on both sides. That is wrong, and measuring every row at full precision showed something more consequential:

| type | rows | `origen` vs `destino` |
|---|---|---|
| `Deposit` | 42 | identical amount and asset |
| `Withdrawal` | 43 | **different** — `origen` is larger |
| `Withdrawal` | 2 | identical |

For a withdrawal the difference *is* the network fee, denominated in the asset, while `Moneda de la comisión` is `EUR` in all 45 rows and carries a EUR valuation rather than a quantity:

```
dest=1.536429 HBAR   orig=2.236429 HBAR   fee=0.210620368 EUR
                     difference = 0.7 HBAR
```

Verified through the real normalizer: the row survives as `TRANSFER_OUT` with `amount_in` and `amount_out` both in HBAR. Two consequences follow.

1. Under the event policy `TRANSFER_OUT` generates a fee disposal from `fee_asset`, which is EUR — fiat, excluded from lot tracking. **The 0.7 HBAR disposal is never recorded**, though a fee paid in crypto is a disposal under IRPF. Across the real file: JASMY 220, GIGA 20, HBAR 11.4, XLM 3.9, ADA 2, AI16Z 2, USDC 0.3, XRP 0.0024, ETH 0.0005, BNB 0.0002.
2. Custody moves the **gross** quantity, so the destination is credited 2.236429 HBAR when only 1.536429 ever arrived — the holding there is overstated by the fee on every withdrawal.

The fee is derivable exactly as `origen − destino` whenever both sides name the same asset. That is 14.19.

The deposits are a different defect: 42 rows duplicate one side, of which 34 are EUR and therefore excluded from lot tracking anyway, but **8 are crypto**. Whether that double-counts depends on whether `v_custody_movements` derives one leg or two from a row carrying both directions — 14.19b.

### D22 — Fee denomination is a per-row fact, and it decides quantity versus basis

Measured across all five real exports, there are **four different conventions**, and one source uses two of them within a single file:

| source | columns | denomination |
|---|---|---|
| Kraken spot | `fee`, **no currency column** | the row's own `asset` |
| Bitvavo | `Fee currency` + `Fee amount` | **mixed** — `EUR` on a `buy`, `XRP`/`XLM` on a `withdrawal` |
| Bitunix | `Fee Asset` + `Fee Amount` | the asset |
| Bit2Me | `Moneda de la comisión` = `EUR` always | a EUR **valuation**; the real amount is `origen − destino` |
| Kraken futures | `fee`, `symbol = usd` | the collateral currency |

The distinction is not cosmetic. A fee paid **in the asset** is a disposal: it reduces the remaining quantity of the lot it is drawn from, and it is itself taxable — the quantity needs no conversion, only the valuation does. A fee paid **in fiat** is a cost that adjusts the basis or the proceeds and must leave every quantity untouched. Treating one as the other either destroys quantity still held or invents quantity that was spent.

Because Bitvavo mixes both inside one file, a per-source default is not merely imprecise, it is wrong. The denomination has to be read per row, with a fallback to the row's own asset only where the source demonstrably has no fee-currency column at all — Kraken spot.

### D23 — The spreadsheet path loses precision before validation ever sees the value

`parseExcel` reads cells with `XLSX.utils.sheet_to_json(..., { header: 1 })`, which returns float64 for numeric cells, and `processRawRows` then applies `String(cell)`. Two measured consequences:

1. **Float artefacts already present in the real files.** 13 cells across the three Bit2Me workbooks carry values such as `0.15742981799999997` where the source figure is `0.157429818`. These pass `preciseAmountSchema`, so they are ingested silently and stored as the artefact.
2. **Exponential notation below `1e-6` is rejected outright.** `String(0.00000001)` is `"1e-8"`, and `preciseAmountSchema` is `/^-?\d+(\.\d+)?$/` — so the row fails validation. The current Bit2Me files bottom out at `1e-4`, so this is not firing today, but satoshi- and gwei-scale quantities are ordinary in crypto and a BTC or ETH workbook would hit it.

The CSV path is unaffected: PapaParse yields strings. The fix is to read cells as formatted text so the source's digits survive to the anti-corruption layer, which is where a decimal string belongs.

Both defects were found by reading the real files, not by the suite — as were D20 and D21. That is why 14.18 and 14.27 exist: a label-level and a quantity-level regression fixture per real source, so a convention cannot change, or a precision assumption fail, without a test noticing.

### D24 — Every movement is `gross = net + fee`, and each source gives you two of the three

Denomination (D22) is only half of what a fee's treatment depends on. The other half is whether the amount the source reports **already reflects** the fee. Deducting a fee the source has already applied destroys quantity that is still held; ignoring one that is charged on top leaves the balance unaccounted for. Both are silent.

Rather than a per-source special case, the model that unifies all five exports is that a movement has three quantities — **gross debited**, **net moved**, **fee** — related by `gross = net + fee`. Every source supplies two and the third is derived:

| source | supplies | derive | evidence |
|---|---|---|---|
| Kraken spot | net (`amount`) + `fee`, in the asset | `gross = net + fee` | its own `balance` column reconciles **8/8**; Kraken's documentation states `balance = old_balance +/- amount - fee` verbatim |
| Bitunix | net (`Outgoing Amount`) + `Fee Amount`, in the asset | `gross = net + fee` | `546.844684 + 1 = 547.844684`, exactly the ADA deposited |
| Bit2Me | gross (`origen`) + net (`destino`) | `fee = gross − net` | the fee column names EUR and holds a valuation |
| Bitvavo `buy` | quantity + price + a fiat fee **already inside** the paid total | nothing — the total is gross | `q × p + fee = paid` exact for **12/12** rows |
| Kraken futures | `fee` in the collateral currency | — | column definition |

Worked example of the hazard, from the real files. A Kraken `withdrawal` of SOL: `amount = -0.006`, `fee = 0.005`, and `balance` drops by `0.011`. The correct treatment moves `0.006` to the destination and records `0.005` as a fee disposal. Treating `amount` as gross would move only `0.001`, and ignoring the fee would leave `0.005` SOL unaccounted for.

The mirror hazard, also from the real files. A Bitvavo `buy`: `0.30338 ETH` at `1645` for a paid total of `499.81 EUR` with a `0.7499 EUR` fee. The basis is `499.81`. Adding the fee again gives `500.5599` — a basis inflated by a fee already inside the total, which understates every future gain on that lot.

**A zero fee is a value, not missing information — and that resolves what looked like an open question.** An earlier draft of this section held that Bitvavo's six withdrawals were undetermined because they all carry `fee = 0`, and sent them to pending review. That was wrong. `fee = 0` states a fact: no fee was charged. And since `gross = net + 0`, **both conventions coincide on a zero-fee row**, so there is nothing left to establish and nothing for the user to review. Kraken writes an explicit `0` on 22 rows and Bitvavo on 18; flagging them would put 40 rows in front of the user with no decision to make.

The state that *is* unknown is an **absent** fee, and the real data carries both: the same Bitvavo export has `Fee amount = '0'` on 12 deposits and an empty cell on 11 others. Verified that the distinction already survives the pipeline — the normalizer emits `fee_amount="0"` versus `undefined`, `preciseAmountSchema.optional()` keeps them apart, and the SQL column is nullable with `CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))`. It is preserved; 14.30b pins it with tests and audits for any `Number(fee)` or `!fee` that would collapse `'0'` into absence.

Two defects surfaced while checking that, both measured:

1. **A Kraken fee reaches the ledger with no denomination.** A standalone Kraken row emerges as `fee_amount="0.0050000000"` with `fee_currency=undefined`, because Kraken has no fee-currency column and `mergeRows` fills it only for *merged* rows — a merged trade does get `fee_currency="PUMP"`. That pair is rejected by both the Zod refine and the SQL CHECK, so 14 real rows cannot be persisted: 11 deposits and 1 transfer at `fee = 0`, plus the two SOL withdrawals at a genuine `0.005`. The denomination belongs in the handler, where the row's own asset is still in scope (14.30c).
2. **`mergeRows` computes fees in floating point and can sum different assets.** `Number(acc.fee_amount || 0) + Math.abs(Number(data.fee_amount))` turned `'17.720'` into `'17.72'` in a measured run, and `fee_currency` keeps whichever leg came last — so two legs with fees in different assets would be added together under one label (14.30d).

**A negative fee exists in the real data.** Bitvavo's promotional row carries `fee = -0.00543739 EUR`, exactly cancelling `q × p` so the paid total is `0.00`. `preciseAmountSchema` and the SQL `CHECK` both permit the sign — verified — so no schema change is needed, but the fee-routing logic must treat it as a credit against the basis and never as a disposal of a negative quantity (14.31).

The general safeguard is 14.32: wherever a source ships a running-balance column, assert `balance = previous ± amount − fee` for every row. That is what proved Kraken's convention here, and it is what would catch the exchange changing it.

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

### D25 — The six open decisions of group 14, settled before implementation

Each was decided against measured evidence, with the rejected alternatives recorded so a later reader
does not have to re-derive them. The task entries carry the same verdicts inline.

**14.4 — Row aggregation moves behind the ingestion boundary.** The frontend sends rows as the source
wrote them; the backend classifies first, aggregates after. Its position in a frontend composable is
precisely why the backend never receives two legs, which made the recorded-counterparty tier
unreachable. Moving it also makes re-ingestion deterministic server-side rather than dependent on a
frontend version, and stops `generateIdHash` computing an idempotency key over an already-merged
record in the client. *Rejected:* keeping it in the frontend with only the ordering fixed — cheaper,
but leaves the counterparty tier permanently dead. *Rejected:* removing aggregation entirely — the
most faithful option, but `LedgerSpotTransaction` models one transaction with an in and an out side,
so a Kraken purchase would arrive as a separate EUR outflow and XRP inflow that the engine would have
to pair into an acquisition. That is an engine change, not an ingestion change.

**14.8 — `transfer_group_id` is populated from the source's own reference, guarded.** With 14.4
decided the tier becomes reachable, so removing it would discard information the source does provide.
The merge rule: legs naming **different** assets merge into one transaction; legs naming the **same**
asset persist separately and share the group id. The guard is what prevents repeating D20 — at
ingestion, validate that the identifier behaves like a reference: same instant, at most two legs. A
group spanning 499 rows over three years is not a reference and is ignored as a link, neither merging
nor pairing. *Rejected:* a backend-synthesised identifier, which derives from the same source
reference and so inherits its reliability while losing direct traceability to the file, and would
still need the guard.

**14.13 — `total_fiat` and `price_fiat` become nullable in migration `005`.** The decisive argument is
internal consistency: the same table already treats `fee_amount` as nullable-with-CHECK while the
fiat magnitudes are `NOT NULL`. This aligns an existing inconsistency rather than inventing a pattern,
and it follows the rule settled for fees — `0` means genuinely free, so "unknown" needs its own
representation. Cost stated plainly: SQLite cannot drop a `NOT NULL` via `ALTER`, so `005` rebuilds
the table as `004` did, and group 4's tests need updating. *Rejected:* amending the spec to "recorded
as `0` and reported as pending", which would leave the distinction living only in an ingestion counter
and a SQL derivation, never in the recorded fact.

**14.16 — a promotional credit becomes a new `PROMOTION` type, recorded in the general base.** The
real row is `Currency: EUR, Amount: 10` — fiat, so no lot is created under any mapping, since
acquisitions require `NOT asset_in_is_fiat`. What was at stake is whether the 10 € survives as income.
*Rejected:* `REWARD`, which appears in neither `general_base_airdrops` nor `savings_base_yields`, so
the income would simply vanish. *Rejected:* `DEPOSIT`, which makes a gift indistinguishable from the
user's own money. *Rejected:* `AIRDROP`, which is fiscally correct and free but calls a euro credit an
airdrop — the class of untrue label this change exists to eliminate — and would permanently mix real
airdrops with promotions. `GIFT` is not in `SPOT_TX_TYPES` at all. `PROMOTION` costs one enum member,
one policy entry that the key-parity test in 2.1 forces, one `TYPE_MAP` entry and one view predicate;
campaigns recur, so the type is reused.

**14.17 — the 315 futures rows stay rejected here, and futures collateral becomes a separate change.**
This reverses an earlier recommendation, on two grounds. First, what the rows are: the 314
`conversion` rows are 157 EUR↔USD collateral pairs — one negative `eur` leg, one positive `usd` leg,
same instant, `conversion spread percentage` on the EUR side — and the single `cross-exchange transfer`
is 200 € arriving in the `flex` account, whose matching leg sits in the **spot** export as
`transfer / spottofutures / EUR / -200`, so no single-file aggregation could ever pair them. Neither
is a position event. Second, what the table is: `futures_transactions` models position events, its
`tx_type` CHECK cannot be extended without a full table rebuild, and its `symbol` column means the
contract — storing `'eur'` there would repeat exactly the error class D20 documented. Position events
and collateral movements are as distinct as spot and futures. Nothing is lost meanwhile: no rejected
row touches crypto FIFO, and `v_futures_realized_pnl` derives PnL from `realized_pnl`, which the
accepted 785 rows carry. *Rejected:* building the collateral table inside group 14, which would add a
futures capability to a change whose subject is spot FIFO traceability.

**Confirmed while deciding 14.17:** the separation the user requires already holds and is strict.
`futures_transactions` is referenced in exactly one place in the whole DuckDB engine —
`v_futures_realized_pnl` — and the entire FIFO and custody chain reads `spot_transactions` only. No
futures row can create a tax lot.

**14.19b — normalise in the anti-corruption layer: a custody movement persists exactly one directional
side.** Confirmed by reading the SQL rather than assuming: `v_custody_movements`'s `legs` CTE is a
`UNION ALL` of the OUT and IN sides, so a row carrying both yields **two** legs on the same account,
netting to zero against the same synthetic counterparty. The deposit lands nowhere, and nothing flags
it, because a net of exactly zero leaves no imbalance to flag. Of the 42 Bit2Me deposits, 34 are EUR
and genuinely harmless — `NOT IN (SELECT id FROM fiat_assets)` drops both legs — but 8 are crypto:
HBAR ×4, USDC, XRP, ETH, ADA. The rule: a deposit keeps `amount_in = destino` and drops the OUT side;
a withdrawal keeps `amount_out = destino` as the net moved, with the fee as `origen − destino` in the
asset, and drops the IN side. That unifies Bit2Me with the `gross = net + fee` model of D24.
*Rejected:* compensating in the DuckDB view, which must read an already-normalised ledger — otherwise
the knowledge that one source duplicates sides is buried in SQL and repeated for the next such source.

### D26 — The fabricated-number defect survives one layer out, in the client

The investigation that opened this change found four independent causes, one of which was
`COALESCE(price, 1.0)` inventing a plausible price where none existed. Group 5 removed it from SQL,
group 2 made `sale_price_fiat` and `gain_loss_fiat` nullable so the engine could *say* "unknown", and
group 10 carried that `NULL` through the port and over HTTP.

The client then converts it back into a number:

```
CommonSchemaHelpers.ts:18    if (val === null || val === undefined) return 0
CommonSchemaHelpers.ts:22    if (trimmed === '') return 0
MockDtoSchemas.ts:21         if (val === null || val === undefined) return 0
ExternalFuturesSchemas.ts:28 if (val === null || val === undefined) return 0
```

It is the same defect with the same shape — a fabricated value standing in for missing knowledge —
and it fails the same way, silently. A disposal whose price could not be resolved renders as a
zero-value disposal rather than as pending review, which is precisely the outcome the flag vocabulary
exists to prevent.

**Why the fix must be surgical.** `numericField` is applied at **210 call sites across seven DTO
modules**. The great majority of those fields legitimately want `0` when the value is missing — a
holding with no recorded change, a fee that was waived. Changing the shared helper to return `null`
would convert every absent number in the application into `null` and break rendering across views
that have nothing to do with fiscal data. The correction is therefore a *separate* nullable variant,
applied only to the fields the backend can genuinely send as `null`: `sale_price_eur` and
`gain_loss_eur` today, and whatever 14ζ's nullable magnitudes add later. A global change would trade
one silent failure for a loud one in unrelated screens.

**A second, louder defect sits beside it.** `ExternalTaxLotSchema.status` is still
`z.enum(["FULL","PARTIAL","EMPTY"])`, and `MockDtoSchemas` declares the same vocabulary twice. Group
10 now sends `OPEN | PARTIAL | CLOSED`, so that parse **fails in the running application**. Tasks 11.2
and 11.4 already own it; it is recorded here because it shares a root cause with the above — the
client's contract drifted from the server's and nothing compared them.

### D27 — A fixture the schema's author wrote is not evidence

Both defects in D26 were live while the frontend suite reported **271 passing tests**. That is not an
oversight in any individual test; it is structural. `zod-schemas.test.ts` has 15 tests and constructs
every one of its own inputs, so the schema and the fixture were written by the same hand against the
same assumption. They agree with each other regardless of what the backend actually sends.

The same shape of gap has now appeared three times in this change, in three different layers:

| layer | what agreed with itself | what caught it |
|---|---|---|
| type-level assertions | `expectTypeOf` compiling to nothing | reading the config, not the suite |
| source vocabulary | fixtures using idealised labels | reading the real export files |
| client DTOs | schema and fixture by one author | reading the backend's own DTO |

None was caught by the tests. Each was caught by comparing an artefact against the thing it claims to
describe. That is what 11.12, 14.18 and 14.27 are: a contract test against the backend's own DTO
definitions, a label-level net over every real export, and a quantity-level net over every real
amount. They are not extra coverage of the same kind — they are the kind that was missing.

### D28 — A random identifier defeats idempotency

Three CSV parsers fall back to `Math.random()` when a row carries no source identifier:
`KrakenSpotCsvParser:126`, `BitvavoCsvParser:69`, `BitUnixCsvParser:61`. Task 11.8 named only the
first.

This matters more than it looks. The entire rebuild and reconciliation model of D13 rests on a
transaction resolving to the same identity across ingestions: reconciliation compares a recomputed set
against a persisted set, and overrides are keyed on transaction identity. A random identifier means
re-ingesting the same file appends duplicates instead of matching, so the derived tables grow, orphan
retirement cannot converge, and any manual override silently detaches from the row it was assigned to.

The identifier must be derived from the row's own mapped content, which is deterministic by
construction and collides only when two rows are genuinely identical in every mapped field.

### D29 — A header-name mapper cannot express a source's conventions, so a third layer is added

Every finding of D20 through D24 has the same shape: the pipeline knows what a column is *called* and
nothing about what the number in it *means* to the exchange that wrote it. `COLUMN_DICTIONARY` can
map `Comisión de la operación` onto `fee_amount`. It has no way to state that the number beside it is
a **EUR valuation of a fee actually paid in HBAR**, and that the real quantity is
`Cantidad de origen − Cantidad de destino`. That is not a gap in the dictionary's contents; it is
outside what a `header → field` function can say at all.

The pipeline therefore becomes three layers with one new seam:

```
  ┌─ 1. READER ───────────────────────────── source-agnostic ────────────┐
  │  parsers.ts — parseCsv / parseExcel / processRawRows                  │
  │  bytes → rows of strings. Owns the xlsx precision fix (14.26).        │
  │  Its ONLY permitted branch is .csv versus .xlsx.                      │
  └────────────────────────────┬─────────────────────────────────────────┘
                               ▼
  ┌─ 2. COLUMN MAPPING ──────────────────── header names → fields ───────┐
  │  guessColumnMapping + the wizard's user confirmation.  UNCHANGED.    │
  │  A confirmed mapping is the user's, and nothing may overwrite it.    │
  └────────────────────────────┬─────────────────────────────────────────┘
                               ▼
  ┌─ 3. SOURCE FORMAT PROFILE ─── what layers 1 and 2 cannot say ────────┐
  │  fee denomination │ fee convention │ directional fill                │
  │  reference vs category columns │ one optional self-check invariant   │
  │  Declarative. Reads no file. Returns no entity.                      │
  └──────────────────────────────────────────────────────────────────────┘
```

*Why a third layer rather than more dictionary entries:* every attempt to encode a convention as a
column name produces a lie about a column. `grupo` mapped to `group_id` was exactly that, and it cost
~99% of the Bit2Me rows.

*Why not per-source code branches in the normalizer:* that is what the five deleted parsers were, and
their failure mode is documented below in D31. A branch is not inspectable, not exhaustively typed,
and not assertable by a test that says "every source declares this".

*Alternative rejected — one profile per row shape rather than per source.* Tempting because Bitvavo
genuinely varies its fee denomination between a `buy` and a `withdrawal`. But that variation is
already expressible **inside** one dimension: the Bitvavo profile declares
`NAMED_COLUMN('Fee currency')`, and reading that column per row is what produces `EUR` on one row and
`XRP` on the next. Splitting the profile per row shape would multiply six profiles into dozens and
reintroduce a selection problem per row.

*Alternative rejected — infer the conventions from the data.* `gross = net + fee` has two unknowns
and one equation per row; a file where every fee is `0` — and 40 real rows are — satisfies both
conventions identically, so inference is undetermined exactly where the data is most abundant. The
conventions must be declared, and the invariant of D33 is what checks the declaration.

### D30 — The profile is split across two packages, and `fifo-policy.ts` is the precedent that says how

Two questions, two answers:

```
  @kryptofolio/shared-types        SOURCE_PROFILE_IDS, SourceProfileId,
   (leaf, no workspace deps)       the ingestion wire field
        │                          ── vocabulary and contract
        ▼
  @kryptofolio/core-domain         SOURCE_FORMAT_PROFILES,
   (depends on shared-types)       SourceFormatProfile + its unions,
                                   detectSourceProfile, the pure appliers
        │                          ── behaviour
        ├──────────────► apps/frontend   (preview)
        └──────────────► apps/backend    (persistence)
```

`fifo-policy.ts`'s own header states the rule being followed: *"This lives in the leaf package on
purpose: it has no workspace dependencies, so the domain layer, the DuckDB views and the ingestion
path all read the same constants."* The operative clause is **the DuckDB views**. `packages/database`
depends on `@kryptofolio/shared-types` and **not** on `@kryptofolio/core-domain`, so anything the
engine must read has to be in the leaf.

No DuckDB view reads a profile, and that is a consequence of a decision already taken rather than an
assumption. D25/14.19b settled that a source that writes both directional sides is normalised **in the
anti-corruption layer**, explicitly rejecting compensation in the view, because the view must read an
already-normalised ledger. The same holds for every other dimension: by the time a row is a
`spot_transactions` row, its fee has a denomination and a quantity, its gross/net/fee triple is
resolved, and it has one directional side. The profile's whole job is over.

So the profile table belongs beside its consumers — `classifyCustodyMovement`,
`TransactionNormalizer`, `rowAggregator`, all in `core-domain` — which is also where the hexagonal
rules put it: a pure declaration plus pure functions, no Zod, no Vue, no Axios, checkable by
`scripts/check-domain-isolation.sh`.

The **identifier** is different, because it crosses the wire. `transactionsBodySchema` in
`routes/ingestion.ts` validates it with Zod, and shared-types is already where the ingestion schemas
and `SPOT_TX_TYPES` live. Putting the union there keeps the frontend, the route and the use case
reading one list, and `Record<SourceProfileId, SourceFormatProfile>` then gives the profile table the
same compile-time exhaustiveness `Record<SpotTxType, FifoEventPolicy>` gives the event policy — adding
a source without a profile is a type error, not a silent fallthrough.

*Alternative rejected — everything in `shared-types`.* It would work, and it is what a reflexive
reading of the `fifo-policy.ts` precedent suggests. Rejected because it inverts the precedent's actual
reasoning: the leaf is for what the dependency graph forces there, and putting behaviour in it that
nothing in `packages/database` reads makes the leaf the default home for anything shared by two
packages. `core-domain` exists to be that home.

*Alternative rejected — the frontend owns the profile and sends resolved values.* The backend would
then trust client-computed fees, and re-ingesting the same file would depend on the frontend version
that submitted it — the same objection that moved aggregation behind the ingestion boundary in D25.

*Alternative rejected — the backend detects the profile from the headers itself.* The headers are not
in the payload; only mapped rows are. Sending the header row so the backend can re-detect would
duplicate the detection and create a second place for the two to disagree. The identifier is smaller,
explicit, and — critically — is what the **user confirmed**.

### D31 — `detect(headers)` was the right idea; resolving ambiguity by array order was the defect

The five parsers in `apps/frontend/src/core/infrastructure/csv/` are deleted. Verified unreachable:
nothing outside that directory and its own `__tests__` imports any of them, and the `MockTaxAdapter`
that `index.ts` names as the registry's consumer — *"MockTaxAdapter iterates this list via detect() to
find the right parser"* — does not exist anywhere in the repository.

Deleting them is not only cleanup. Their content contradicts the domain this change establishes:

```
  KrakenSpotCsvParser._parseSingleRow          the domain, after group 3
  ─────────────────────────────────────        ────────────────────────────────
  type === 'deposit'  → 'DEPOSIT'              classifyCustodyMovement: a crypto
                                               deposit is TRANSFER_IN; only fiat
                                               is DEPOSIT                (D2, D4)
  totalEur: 0, priceEur: 0, feeEur: 0          the fee is a disposal under IRPF
  on every movement                            and is the event this whole change
                                               exists to record       (D1, 14γ)
  `kraken-${txid ?? refid ?? Math.random()}`   deterministic identity is what
                                               reconciliation rests on     (D28)
```

A second, contradictory ingestion model left in the tree is a trap for the next reader, and this
change has already been bitten three times by an artefact that agreed with itself (D27).

**What is kept is the one part that was right.** The pipeline is currently format-blind — nothing
anywhere selects a source — and the profile has to be selected somehow. `detect(headers)` is the
correct primitive: header names are the only source signature available before any mapping happens.

What is *not* kept is how the registry used it. `index.ts` says so in its own words: *"Order matters
for detect() — parsers are checked in sequence. Bit2Me should be checked BEFORE Tangem since Tangem is
a catch-all for simple formats."* An outcome that depends on array position is the same class of
fragility as the three duplicated `NOT IN` lists of D1 — correct until someone reorders it, and silent
when they do. `TangemCsvParser` already contained the fix and did not generalise it: its `detect` is
`REQUIRED_HEADERS.every(...) && !EXCLUDE_IF_PRESENT.some(...)`, so the catch-all needs **negative
evidence** before it wins.

`detectSourceProfile` therefore takes a signature of required *and* forbidden headers per profile, and
returns a discriminated result: resolved, ambiguous with every candidate listed, or unrecognised. It
never picks. An ambiguity is surfaced to the user, who is already confirming the column mapping one
step later and is the right authority; an unrecognised file falls to the `generic` profile, whose
undetermined dimensions are reported pending rather than assumed.

### D32 — The wizard's flow is preserved; exactly one contract changes, and it is the submit signature

The user-facing flow — drop a file, confirm the column mapping, preview and validate, submit — is
load-bearing and stays. The valuable part is specifically the **confirmation**: the profile answers
questions the mapping cannot, and it must never answer one the mapping already did.

Preserved, and asserted by 14.50:

| artefact | contract held |
|---|---|
| `useCsvImportWizard.ts` | `WizardStep = 1 \| 2 \| 3`. No fourth step; the profile lives inside step 1 |
| `useFileParser.parseFile(file)` | returns `ParseResult { data, headers, errors }`; 14.26 changes cell *values*, not the shape |
| `useColumnMapper` | `initializeMapping(headers)` and the `mapping` ref unchanged; the user may still change any column |
| `usePreviewTable` | `generatePreview(rows, mapping)` still callable with two arguments; the profile is an **optional third** parameter, so both existing call sites keep compiling |
| `DataIngestionWizard.vue`, `DropzoneArea.vue`, `DataGridValidator.vue` | props and emits unchanged |
| `CsvImportWizardContext` | gains a `sourceProfile` ref — additive; no existing consumer is affected |

**The one deliberate break.** `processAndSubmit(validRows, marketType, accountId)` becomes
`processAndSubmit(validRows, marketType, accountId, sourceProfileId)`; the mutation body gains
`sourceProfileId` beside `rows`, `market` and `timezone`; and `transactionsBodySchema` gains the field.
This is a contract change at three boundaries and is called out as one rather than smuggled in.

The wire field is **required, not optional with a default**. An optional field would mean an omitted
profile silently becomes some assumed convention — precisely the failure D16 removed when
`toSpotTxType()` stopped defaulting to `'BUY'`, and D6 removed when `COALESCE(price, 1.0)` stopped
inventing a plausible price. The frontend always sends a value; when nothing was detected that value
is `generic`, which *declares its own uncertainty* instead of hiding it. The consequences are real and
in scope: `useImportProcessor.spec.ts` and `routes/__tests__/ingestion.test.ts` payloads change, and a
submission missing the field is asserted to be rejected.

*Alternative rejected — a fourth wizard step for source selection.* It makes a correct auto-detection
cost the user a click on every import, and `WizardStep` is a typed union three components read.

*Alternative rejected — keep the profile entirely client-side and let the preview be the only consumer.*
The backend is where fees and types are resolved. A client-only profile would leave the preview and the
stored ledger free to disagree, which is the drift D27 catalogues three instances of.

### D33 — A declared convention needs a check the source's own data can fail

A profile is an assertion about an exchange's export format, and exchanges change their exports. The
declaration is therefore paired with an optional invariant that the source's own columns can refute.

The running-balance check is not a hypothetical: it is the method that established Kraken's convention
in the first place. `balance = previous ± amount − fee` reconciled **8 of 8** rows, and Kraken's
documentation states that formula verbatim. Without it the choice between "amount is net" and "amount
is gross" would have been a guess, and guessing wrong moves `0.001 SOL` instead of `0.006` while
leaving `0.005` unaccounted for.

The invariant is a discriminated union with an explicit `NONE` member rather than an optional field,
so "this source cannot self-check" is a stated fact a reviewer can see, not an omission indistinguishable
from an oversight. Bit2Me, Bitvavo, Bitunix and Tangem ship no running-balance column and declare
`NONE`; Kraken spot declares its `balance` column.

**RESOLVED — `NONE` stays, and the criterion is independence, not the presence of a balance column.**
The proposed universal alternative — asserting the gross/net/fee triple is internally consistent — was
rejected because for three of the four sources it is a **tautology**. Kraken and Bitunix supply net and
fee and *derive* gross; Bit2Me supplies gross and net and *derives* the fee. Asserting a relation the
profile itself computes can never fail, so it would give four profiles the appearance of verification
and the substance of none. It is not universal either: it is per-source, like everything else here.

The qualifying test is therefore **independence from the profile's own derivation**, and the measured
sources ship two forms of it, not one:

| form | source | why it is independent |
|---|---|---|
| running balance | Kraken spot | `balance` takes no part in the derivation — 8 of 8 rows, formula stated verbatim in Kraken's documentation |
| over-determined row | **Bitvavo** | `quantity × price + fee = paid` spans four columns, none derived from the others — exact on 12 of 12 rows |

That corrects the paragraph above: **Bitvavo can self-check.** Only Bit2Me, Bitunix and Tangem declare
none. And the asymmetry is worth stating rather than smoothing over — Bit2Me's convention is caught
only by 14.27's digit-for-digit net, never by an invariant, so 14.49's break list says so explicitly
instead of implying coverage the profile does not have.

**RESOLVED — the excluded-header sets are a default-selection tie-breaker, not a correctness
mechanism.** The question assumed detection had to be right. It does not: the profile is a **required**
field on the ingestion contract and the user confirms it in step 1, so the backend never infers one.
A misdetection therefore degrades into a wrong default in a selector the user can change with one
click, never into wrongly interpreted data. The exclusion lists need not be exhaustive — start from the
header names unique to each of the other five sources and let a real ambiguity report extend them.

The one rule that does matter: **on an ambiguity, select nothing.** Leave the control unset and require
the user to choose. A default among equal candidates is the array-order defect of `REGISTERED_PARSERS`
wearing a different hat.

**What made both questions answerable was reading the wizard.** Step 1 already contains two
detect-or-choose controls — the account `Select` and the `v-model` on `marketType`, which is populated
by `detectMarketTypeFromFile`. The profile is a third instance of an established pattern, not a new
concept, and that is what turns a detection risk into a UI default.

### D34 — Deriving the market from the profile retires a filename guess

`detectMarketTypeFromFile` decides spot versus futures by searching the **file name** for `future`,
`futuro` or `deriv`. A Kraken futures export saved under any other name is ingested as spot, silently,
and the user's only clue is a market-type control they have no reason to distrust.

A profile knows its market as a declared fact. The Kraken futures header row carries `funding rate`,
`realized pnl` and `position uid`; no spot export has any of them. Once the profile resolves, the
filename adds nothing and can only contradict.

Keeping both would leave two detections able to disagree about one file, and the weaker of the two is
the one whose reasoning the user cannot inspect. So the profile sets the market type (14.44c) and
`detectMarketTypeFromFile` is retired or reduced to the unrecognised-profile fallback with that stated
at its definition (14.44b). The existing control stays editable: an explicit user choice still wins
over a declaration, exactly as it does today.

**Corrections to the existing record, forced by D31.** Two statements in this document are wrong and
are repaired by 14.48:

1. **D5b and `fifo-policy.ts:117` say `WALLET_ACTIVATION` is "produced by `TangemCsvParser`".** It is
   not. That parser is unreachable, so **nothing in the running application produces the flag today**.
   The reasoning D5b rests on is nonetheless sound and unaffected: the flag is live *production data*
   — `tangem_activacion_xrp.csv` carries `WALLET_ACTIVATION` in its `Type` column — and it is consumed
   by `useTaxCalculations.ts:160`, `LotEventHistory.vue:30` and the DTO schemas. What was wrong is only
   the named producer. Task **14.15** is the producer, and until it lands the flag has no write path,
   which strengthens rather than weakens the case for keeping `flag` and `quality_flag` separate.
2. **D28 names `KrakenSpotCsvParser:126`, `BitvavoCsvParser:69` and `BitUnixCsvParser:61` as the three
   `Math.random()` sites to repair.** All three files are deleted. The premise stands — a random
   identifier defeats the idempotency reconciliation rests on — but the live identifier path is
   `generateIdHash` over the mapped record, so what remains is the assertion rather than the repair.
   Tasks 11.8 and 11.11 are amended accordingly, without renumbering.

### D35 — What phase 14β settled while implementing 14.15, 14.16, 14.17 and 14.31

**14.15 — the canonical type for a wallet activation is `BUY`, and the classification rides beside it,
not inside it.** D5b models `WALLET_ACTIVATION` as a fiscal classification rather than a `tx_type`, so
the label has to resolve to an existing acquisition type. Of the six, five fabricate income the user
never earned: `AIRDROP` and `MINING` report the reserve in the general base, `STAKING` and `REWARD` in
the savings base, and `SWAP` invents a disposal. `BUY` is the only one that opens a lot valued at the
market price of the moment — which is the correct treatment for crypto that appears with no purchase
record — and routes into no income view. *Rejected:* `DEPOSIT`, which is what the deleted
`TangemCsvParser` used: as a custody movement it creates no lot at all, so the 1 XRP would exist in no
basis and the classification would have nothing to travel on.

**The flag needed a column on `spot_transactions` to travel at all, and that is a defect this phase
closed rather than a design choice it made.** `v_calculated_lot_history_events` hard-coded
`CAST(NULL AS VARCHAR) AS flag`: no ingestion path, however correct, could have populated it. The flag
is now stated on the transaction — where the source states it — and every derived event inherits it
from the transaction it derives from, which is a single producer and a single reader.

**A limitation of that chain, stated rather than left to be discovered.** `lot_history_events` holds
disposal matches only, so an acquisition-shaped operation produces an event solely through its *fee*
disposal. The real Tangem row carries `Fee 0.0`, so it yields a lot and no event: its classification
lives on `spot_transactions.flag` and reaches the event table only for a flagged operation that
disposes of something. The scenario "a Tangem wallet-activation operation is ingested and derived →
its event MUST retain `flag = 'WALLET_ACTIVATION'`" in `fifo-data-quality-flags` is therefore
satisfiable in general and vacuous for that particular row. Nothing is lost — the classification is
persisted and queryable — but the spec's wording implies an event that the materialisation model does
not produce, and a later change that wants one must decide whether acquisitions belong in the event
history at all.

**14.31 — the guard is a sign, in two places.** Ingestion stops taking the absolute value of the fee,
because no export in the corpus writes a *charged* fee as negative and Bitvavo writes a credited one
that way; the sign therefore carries information, not direction. The fee-disposal branch then requires
`qty_fee > 0`. Both are load-bearing: a negative fee disposal matches no lot, so it is invisible in the
event history while still reaching `v_daily_running_balances`, which subtracts disposals and would have
*added* the rebate to the user's holdings.

**14.17 — the deferral is now a change.** `openspec/changes/add-futures-collateral-ledger` holds the
collateral table (account, movement type, currency, signed amount, spread, instant) and the
per-currency balance view, with the scope boundary written into its proposal: spot and futures never
mix, futures never holds the asset, only the currency movements and the PnL matter. The 315 rows stay
rejected here, and no crypto FIFO figure depends on them.
