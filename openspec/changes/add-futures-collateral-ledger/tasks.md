# Tasks

## 1. Schema

- [ ] 1.1 Write the migration test first: the collateral table exists, its columns are
      `account_id`, `movement_type`, `currency`, `amount` (signed), `spread_pct` (nullable),
      `occurred_at`, plus `id_hash` for idempotent re-ingestion; `futures_transactions` is unchanged
- [ ] 1.2 Add the migration. Do NOT touch `futures_transactions`
- [ ] 1.3 Assert the signed amount is representable and that a zero amount is distinguishable from an
      absent one, following the `fee_amount` rule settled in the parent change's D24

## 2. Ingestion

- [ ] 2.1 Write the test: the real `conversion` and `cross-exchange transfer` labels are no longer in
      `IngestionResult.rejected`, and the 785 position rows are still persisted as futures
      transactions
- [ ] 2.2 Route the two labels to the collateral table from the futures branch of
      `CsvIngestionUseCase`. No spot code path may be reachable from a collateral row
- [ ] 2.3 Test and implement the pairing guard: legs pair only when the instant matches and the signs
      oppose; anything else is recorded one-sided rather than guessed

## 3. Engine

- [ ] 3.1 Write the view test on a fixture with one EUR↔USD pair and one unpaired transfer: per-currency
      balances move independently, and no legs cancel inside one currency
- [ ] 3.2 Add the per-currency collateral balance view
- [ ] 3.3 Assert no collateral row reaches `v_flattened_fifo_events`, any tax lot, or
      `v_futures_realized_pnl`

## 4. Verification

- [ ] 4.1 Drive the whole real `kraken_futures.csv` through parser, normalizer and ingestion: 1100 rows
      in, 0 rejected, 785 position rows and 315 collateral movements out
- [ ] 4.2 Confirm the spread of all 157 pairs is stored, digit for digit against the source
- [ ] 4.3 Add a changeset describing the new table and the newly ingestible rows
