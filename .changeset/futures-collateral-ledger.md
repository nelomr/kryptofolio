---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
"@kryptofolio/core-domain": patch
---

Ingest Kraken futures collateral movements instead of rejecting them. The 314 `conversion` rows
(157 EUR↔USD collateral pairs) and the 1 `cross-exchange transfer` in a real `kraken_futures.csv`
export were previously rejected outright — measured against the full file, 315 of 1100 rows never
reached the ledger.

- **New `collateral_movements` table**, separate from `futures_transactions`: a currency movement
  that funds or converts futures collateral is not a position event, and `futures_transactions`'s
  `symbol` column names a contract, not a currency. Records account, movement type, currency, a
  signed amount, an optional conversion spread, and an optional pairing link — never a tax lot,
  never a disposal.
- **Pairing guard**: two conversion legs link only when they share an instant and their signs
  oppose. Kraken's own timestamp resolution puts several real conversions in the same second, so the
  guard pairs adjacent legs within an instant rather than requiring exactly two — measured against
  the real file, this reproduces all 157 pairs with nothing guessed. The single cross-exchange
  transfer stays unpaired: its counterpart lives in a separate spot export, and pairing across files
  is exactly the heuristic this change avoids.
- **`v_collateral_balances`**: a new per-account, per-currency DuckDB view, derived from the signed
  amounts. It reads only `collateral_movements` — no collateral row reaches FIFO, a tax lot, or
  `v_futures_realized_pnl`.

Unrelated fix, piggybacked in the same release: **`v_calculated_tax_lots` now guarantees FIFO row
order.** The view had no `ORDER BY` on its final `SELECT`, so DuckDB returned tax lots in whatever
incidental join/execution order it produced — not the chronological, per-asset FIFO order the tax
engine requires. `DuckDbTaxCalculatorAdapter`, `GetTokenHistoryUseCase`, and the lot tables in the
UI (`ExpandedLotsTable.vue`, `TokenActiveLots.vue`) all render whatever array order they receive
without re-sorting, so the view itself now sorts by `acquisition_timestamp, source_tx_id` before
returning.

Follow-up in the same release: `DuckDbTaxCalculatorAdapter.calculateLotsAndEvents` — the method that
actually reads `v_calculated_tax_lots` for `GetTokenHistoryUseCase` and the FIFO materializer — also
now carries its own `ORDER BY acquisition_timestamp, source_tx_id` (and `ORDER BY disposal_date, id`
on its events query), since DuckDB documents no guarantee that a view's own order survives an outer
`SELECT * ... WHERE ...`. The equivalent `ORDER BY` was also added to the `v_calculated_lot_history_events`
view, which had none. Testing at several fixture sizes did not reproduce an actual case of the outer
query losing order either before or after this change, so this is defensive hardening rather than a
confirmed fix — if lot dates still render out of order after upgrading, restart the backend process
first (a running process holds the view definitions it started with; editing view SQL does not affect
an already-initialized DuckDB instance) before assuming a further defect.
