# Baseline — before FX conversion

Captured 2026-08-05 from the real ledger (`kryptofolio_ledger.db`, 1.4 MB) with
`node:sqlite` under Node 24.16.0, read-only. Task 0.2.

## `tax_lots` (578 rows)

| `quality_flag` | rows | of which `unit_cost_fiat = 0` |
|---|---|---|
| `CURRENCY_MISMATCH` | 544 | 544 |
| *(none)* | 34 | 0 |

Every flagged lot has a zero basis and every unflagged lot has a non-zero one — the
flag and the zero are the same population, which is what makes the masking rule
(`v_calculated_tax_lots`) the sole reason 94 % of the portfolio reports no cost.

`value_provenance`: 578 × `MARKET`, 0 × `MANUAL`.

Total recorded basis across all lots: **2 396.442987727945** (reporting currency).

### `CURRENCY_MISMATCH` lots by asset

| asset | lots |
|---|---|
| B2M | 432 |
| GIGA | 29 |
| ADA | 22 |
| HBAR | 18 |
| XRP | 17 |
| VELO | 13 |
| XLM | 5 |
| JASMY | 4 |
| AI16Z | 3 |
| ETH | 1 |

## `lot_history_events` (185 rows)

| `quality_flag` | rows |
|---|---|
| `CURRENCY_MISMATCH` | 138 |
| *(none)* | 47 |

`sale_price_fiat` is non-null on all 185. `gain_loss_fiat` is null on 138 — exactly the
flagged population, so no disposal against a flagged lot yields a gain today.

## `exchange_rates` (509 rows)

Only pair present: `USD/EUR`. Range `2024-11-01` … `2026-03-24`.
`source`: 348 × `ECB`, 161 × `ECB_PRIOR_DAY` — the carried-forward marker the design
relies on already exists in the data.

Written solely by `pnpm seed:ecb-rates`; the running backend contributes nothing.

## Test / typecheck baseline (task 0.3)

`pnpm typecheck` and `pnpm test` both exit 0 at commit `1d30bb7`
(66 frontend test files / 452 tests, plus every other package's suite).
