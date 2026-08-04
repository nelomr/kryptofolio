## Why

Kraken's real futures export (`kraken_futures.csv`, 1100 rows) contains 315 rows that the ingestion
mapper rejects and that no table in the schema can hold:

- **314 `conversion` rows** — 157 EUR↔USD collateral pairs. Each pair is one negative `eur` leg and
  one positive `usd` leg at the same instant, with a `conversion spread percentage` recorded on the
  EUR side.
- **1 `cross-exchange transfer`** — 200 € arriving in the `flex` account. Its matching leg is not in
  this file at all: it sits in the *spot* export as `transfer / spottofutures / EUR / -200`, so no
  single-file aggregation could ever pair the two.

Neither is a position event. `futures_transactions` models position events: its `tx_type` CHECK
admits only `TRADE`, `FUNDING_FEE`, `SETTLEMENT` and `LIQUIDATION` and cannot be extended without a
full table rebuild, and its `symbol` column means the *contract* — storing `'eur'` there would repeat
the error class documented as D20 in `fix-fifo-transfer-traceability`, where one identifier was read
as evidence of something it never described. Position events and collateral movements are as distinct
as spot and futures, and deserve their own table.

Nothing is lost while this is outstanding, which is why it was deferred rather than folded into
`fix-fifo-transfer-traceability`: no rejected row touches crypto FIFO, and `v_futures_realized_pnl`
derives PnL from `realized_pnl`, which the 785 accepted rows carry. What *is* missing is the
collateral picture — the user cannot see what currency their margin is held in, what a conversion
cost them in spread, or how much fiat they moved into the venue.

## What Changes

- **A collateral movement table**, separate from both `spot_transactions` and `futures_transactions`,
  holding: account, movement type, currency, signed amount, spread, and instant.
- **A per-currency collateral balance view**, so the margin held in each currency is readable.
- **Ingestion mapping** for the `conversion` and `cross-exchange transfer` labels into that table,
  replacing today's rejection.
- **Conversion pairing** from the source's own instant and sign, with the same guard rule the spot
  path uses: an identifier or instant is treated as a link only when it behaves like one.
- **The cross-venue leg stays unpaired and is recorded as such.** Its counterpart lives in a
  different file; inventing a pairing across files is the failure mode this change must avoid.

## Capabilities

### New Capabilities
- `futures-collateral-movements`: records the currency movements that fund a futures account —
  conversions, cross-venue transfers and their spread — separately from position events.

### Modified Capabilities
- `csv-data-ingestion`: the two futures labels that are rejected today are routed to the collateral
  table instead.

## Impact

- **Scope boundary, non-negotiable:** spot and futures never mix. Futures never holds the asset —
  only the currency movements and the PnL matter. No collateral row may create or consume a tax lot.
- **Schema**: a new migration adding the collateral table; `futures_transactions` is not touched.
- **Engine**: a new per-currency balance view; `v_futures_realized_pnl` is unchanged.
- **Ingestion**: `CsvIngestionUseCase`'s futures branch gains a third destination.
- **Prerequisite**: `fix-fifo-transfer-traceability` (this change's rationale is recorded there as
  D25/14.17, and its ingestion boundary is what this builds on).
