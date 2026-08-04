## Context

Deferred out of `fix-fifo-transfer-traceability` by its decision 14.17 (recorded as D25 in that
change's `design.md`). The measurements below were taken there, against the real
`kraken_futures.csv`, and are not re-derived here.

| label | rows | what it is |
|---|---|---|
| `conversion` | 314 | 157 EUR↔USD collateral pairs: one negative `eur` leg, one positive `usd` leg, same instant, `conversion spread percentage` on the EUR side |
| `cross-exchange transfer` | 1 | 200 € into the `flex` account; the matching leg is in the **spot** export as `transfer / spottofutures / EUR / -200` |

## Decisions

### A collateral movement is a separate record type, not a widened futures transaction

`futures_transactions.tx_type` is a SQLite CHECK over four position events, and SQLite cannot extend a
CHECK without rebuilding the table. That cost is not the reason for the separation, though — the reason
is that `symbol` means the contract. A row whose `symbol` is `'eur'` would read as a position in a
EUR instrument to every consumer of that column, including `v_futures_realized_pnl`.

*Rejected:* adding `CONVERSION` and `TRANSFER` to the CHECK and storing the currency in `symbol`.
Cheapest, and it makes the strongest existing invariant of the futures tables untrue.

### The signed amount is the record, and it is signed on purpose

Every fiat magnitude in the ledger is a non-negative magnitude with direction carried by the type. A
collateral movement is the exception for the same reason `lot_custody_entries.qty_delta` is: the two
legs of a conversion must sum to zero *within* the pair while remaining separable *per currency*, and
that is a property of the signed values, not of a type label.

### The unpaired cross-venue leg stays unpaired

Its counterpart is in a different file, and it is the only row of its kind in the corpus. Pairing
across files by amount and instant is precisely the heuristic the parent change removed from the spot
path. Recording it as a one-sided movement is honest and leaves the pairing available later, if the
user ever imports both files into one account.

## Open Questions

- Whether a collateral movement should ever produce a fiscal event. Working assumption: no. A EUR↔USD
  conversion inside a venue is a currency exchange, not a crypto disposal, and the spread is a cost
  rather than a loss on an asset. This needs confirming against AEAT treatment before the balance
  view is surfaced as anything more than an informational figure.
