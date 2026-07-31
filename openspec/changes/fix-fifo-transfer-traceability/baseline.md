# Baseline — pre-fix measurements

Captured before migration `004`. These are the numbers the fix is verified against in task group 13.

**Ledger:** `kryptofolio_ledger.db` (development; no production deployment).
**No backup taken** — clean slate is authorised and all source CSVs are re-ingestable.

## Transaction inventory

| tx_type | count |
|---|---|
| DEPOSIT | 32 |
| STAKING | 29 |
| BUY | 29 |
| WITHDRAWAL | 6 |
| AIRDROP | 1 |
| **SELL / SWAP** | **0** |
| **TRANSFER_IN / TRANSFER_OUT** | **0** |

Total active + COMPLETED: 97.

The engine reports 73 disposal events despite **zero sales existing**. Every one is phantom.

## Derived-data defects

| metric | value |
|---|---|
| `tax_lots` total | 96 |
| ‑ with `unit_cost_fiat = 0` | 64 |
| ‑ with `unit_cost_fiat < 0` | 11 |
| `lot_history_events` total | 73 |
| orphan lots (source tx missing/deleted) | 5 |
| orphan events | 3 |
| `spot_transactions` with negative `total_fiat` | 11 |

## Phantom gains by source transaction type

| source tx_type | events | Σ gain_loss_fiat |
|---|---|---|
| **WITHDRAWAL** | 24 | **+1.234,46** |
| BUY (fee-disposal branch) | 29 | +15,96 |
| (orphan — source tx gone) | 3 | +3,24 |
| DEPOSIT | 17 | 0,00 |

`WITHDRAWAL` rows are wallet/exchange transfers. Their +1.234,46 € is the headline defect: a
negative `unit_cost_fiat` (e.g. `-1,6724 €/XRP`) minus a `sale_price_fiat` of `0` yields a
**positive** gain.

## XRP detail

| source tx_type | lot status | count |
|---|---|---|
| BUY | CLOSED | 10 |
| BUY | OPEN | 2 |
| BUY | PARTIAL | 1 |
| **DEPOSIT** | **CLOSED** | **4** |

17 lots total; 14 `CLOSED`, all consumed by the 5 `WITHDRAWAL` rows. The 4 `DEPOSIT`-derived
lots are phantoms with zero cost basis.

## Accounts (pre-hierarchy)

Flat, no `parent_account_id`, no `is_synthetic`:

| id | name | type |
|---|---|---|
| `…0001` | Binance | exchange |
| `…0002` | Kraken | exchange |
| `…0003` | Bit2Me | exchange |
| `…0004` | Ledger | wallet |
| `…0005` | Coinbase | exchange |
| `…0006` | Revolut | bank |
| `…0007` | Bitvavo | exchange |
| `…0008` | Bitunix | exchange |

No Kraken sub-wallets exist. The `wallet` CSV column was parsed but discarded, so sub-wallet
identity **cannot be recovered retroactively** — this is why re-ingestion is required regardless
of the clean slate (design D9, D12).

## Expected post-fix state (assertions for group 13)

- No lot derived from a crypto `DEPOSIT`; XRP lot count equals genuine XRP acquisitions only.
- Σ `gain_loss_fiat` over events whose `disposal_type` is not `FEE` = **0** for this sale-free ledger.
- The +1.234,46 € from `WITHDRAWAL` rows is gone.
- Zero lots with negative `unit_cost_fiat`.
- Zero orphan lots and zero orphan events.
- ~30 rows carry `quality_flag = 'MISSING_PRICE'` (29 `STAKING` + 1 `AIRDROP`), non-blocking.
- `CURRENCY_MISMATCH` on the XRP rows storing `fiat_currency = 'USD'` with `EUR` fees.
- Kraken transactions attributed to `Kraken:spot` / `Kraken:earn` child accounts.

## Source CSVs for re-ingestion

Re-export required from Kraken **including the `wallet` column** (`txid, refid, time, type,
subtype, aclass, subclass, asset, wallet, amount, fee, balance`). Record actual paths here when
re-ingesting in task 13.3.

- [ ] Kraken spot export: `<path to be recorded>`
- [ ] Tangem export (WALLET_ACTIVATION rows): `<path to be recorded>`
- [ ] Other venue exports: `<paths to be recorded>`
