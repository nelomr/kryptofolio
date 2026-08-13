# Csv Data Ingestion Specification

## Purpose

Reading an exchange export without losing or inventing anything: sign normalisation, a fee's denomination resolved from its own source rather than assumed, whether an amount already includes the fee resolved per source, and source quantities surviving digit for digit.
## Requirements
### Requirement: Fiat Magnitudes Are Sign-Normalised at Ingestion

`CsvIngestionUseCase` SHALL persist `total_fiat` and `price_fiat` as non-negative magnitudes, applying `.abs()` symmetrically with the treatment already applied to `amount_in` and `amount_out`. Transaction direction SHALL be carried by `tx_type` and the directional asset fields only.

#### Scenario: Kraken BUY row with a negative EUR cost leg

- **WHEN** a source row yields `total_fiat = -299.70` for a `BUY` of 247.10551 XRP
- **THEN** the persisted `total_fiat` MUST be `299.70`
- **AND** the derived `unit_cost_fiat` MUST be positive

#### Scenario: Persistence layer rejects negative fiat magnitudes

- **WHEN** an attempt is made to insert a `spot_transactions` row with a negative `total_fiat` or `price_fiat`
- **THEN** the SQLite `CHECK` constraint MUST reject the write

#### Scenario: Sign normalisation is applied via the precision value object

- **WHEN** fiat magnitudes are normalised
- **THEN** the computation MUST use `Decimal` / `PreciseAmount` arithmetic
- **AND** native JavaScript `number` arithmetic MUST NOT be used

### Requirement: A Fee's Denomination Is Resolved From Its Source, Never Assumed

A fee's denomination decides how it enters the calculation, so it SHALL be resolved from the source's own convention rather than defaulted. The five real sources use four different conventions:

| source | columns | denomination |
|---|---|---|
| Kraken spot | `fee`, **no currency column** | the row's own `asset` |
| Bitvavo | `Fee currency` + `Fee amount` | **mixed** — `EUR` on a `buy`, the asset itself on a `withdrawal` |
| Bitunix | `Fee Asset` + `Fee Amount` | the asset |
| Bit2Me | `Moneda de la comisión` = `EUR` always | a **EUR valuation**; the asset-denominated amount is `origen − destino` |
| Kraken futures | `fee` with `symbol = usd` | the collateral currency |

A fee paid **in the asset** is a disposal of that asset: it reduces the remaining quantity of the lot it is drawn from and is itself a taxable disposal, so no conversion is needed to determine the quantity — only to value the gain. A fee paid **in fiat** is a cost: it adjusts the acquisition basis or the disposal proceeds and MUST NOT reduce any asset quantity.

Treating one as the other either destroys quantity that is still held or invents quantity that was spent.

#### Scenario: An in-asset fee reduces the quantity and is a disposal

- **WHEN** a Kraken spot `trade` row carries `asset = PUMP` and `fee = 17.720` with no fee-currency column
- **THEN** the fee MUST be resolved as `17.720 PUMP`
- **AND** it MUST be recorded as a fee disposal drawn from the PUMP lots by global FIFO
- **AND** it MUST NOT be interpreted as a fiat cost

#### Scenario: A fiat fee adjusts the basis and never the quantity

- **WHEN a** Bitvavo `buy` row carries `Fee currency = EUR`
- **THEN** the fee MUST adjust the fiat basis
- **AND** the acquired quantity MUST be unchanged
- **AND** no fee disposal of the acquired asset MUST be recorded

#### Scenario: One source mixes both conventions across its own rows

- **WHEN** the same Bitvavo export carries `Fee currency = EUR` on a `buy` and `Fee currency = XRP` on a `withdrawal`
- **THEN** each row MUST be resolved independently from its own fee-currency value
- **AND** a per-source default MUST NOT be applied

#### Scenario: A fee recorded only as a fiat valuation does not silence the asset disposal

- **WHEN** a Bit2Me `Withdrawal` records gross `origen`, net `destino` in the same asset, and a fee expressed in `EUR`
- **THEN** the asset-denominated fee MUST be derived as `origen − destino`
- **AND** the custody movement MUST carry the **net** quantity to the destination
- **AND** the derived asset fee MUST be recorded as a disposal rather than dropped because the fee column named a fiat currency

#### Scenario: An unresolvable fee denomination is reported, not guessed

- **WHEN** a row carries a fee amount whose denomination cannot be resolved from the source
- **THEN** the row MUST be reported as pending review
- **AND** the fee MUST NOT be assumed to be fiat or to be the row's asset

### Requirement: Whether a Fee Is Already Reflected in the Amount Is Resolved Per Source

Independently of its denomination, a source either reports an amount that **already excludes** its fee or one that **still includes** it. Ingestion SHALL resolve which, per source, and SHALL NOT apply the fee twice or ignore it.

Every movement reduces to three quantities — **gross debited**, **net moved**, and **fee** — where `gross = net + fee`. Each source supplies two of the three, and the third is derived:

| source | supplies | derive | verified by |
|---|---|---|---|
| Kraken spot | net (`amount`) + `fee`, both in the asset | `gross = net + fee` | its own `balance` column reconciles 8/8 as `balance = prev ± amount − fee`, and Kraken's documentation states that formula verbatim |
| Bitunix | net (`Outgoing Amount`) + `Fee Amount` in the asset | `gross = net + fee` | balance arithmetic: `546.844684 + 1 = 547.844684`, exactly the total deposited |
| Bit2Me | gross (`origen`) + net (`destino`) | `fee = gross − net` | the fee column names `EUR` and holds a valuation, not a quantity |
| Bitvavo `buy` | quantity + price + a fiat fee **already contained** in the total paid | nothing — the total is gross | `quantity × price + fee = paid` holds exactly for 12/12 rows |
| Kraken futures | `fee` in the collateral currency, separate column | — | column definition |

#### Scenario: A fee charged in addition is not silently dropped

- **WHEN** a Kraken spot `withdrawal` records `amount = -0.006 SOL` and `fee = 0.005 SOL`
- **THEN** the custody movement MUST carry `0.006 SOL` to the destination
- **AND** a fee disposal of `0.005 SOL` MUST be recorded
- **AND** the total debited from the source account MUST be `0.011 SOL`

#### Scenario: A fee already contained in the total is not deducted twice

- **WHEN** a Bitvavo `buy` records `0.30338 ETH` at `1645`, a paid total of `499.81 EUR`, and a fee of `0.7499 EUR`
- **THEN** the acquisition basis MUST be `499.81 EUR`
- **AND** the fee MUST NOT be added to it again, which would report `500.5599`
- **AND** the acquired quantity MUST remain `0.30338 ETH`

#### Scenario: A fee already deducted from the received quantity is not deducted again

- **WHEN** a Bit2Me `Withdrawal` records `origen = 2.236429 HBAR` and `destino = 1.536429 HBAR`
- **THEN** the fee MUST be derived as `0.7 HBAR`
- **AND** the custody movement MUST carry `1.536429 HBAR`, not `2.236429`
- **AND** `1.536429` MUST NOT be reduced by the fee a second time

#### Scenario: A rebate is not treated as a disposal

- **WHEN** a source records a negative fee, as Bitvavo does on a promotional row where `fee = -0.00543739 EUR` brings the paid total to `0.00`
- **THEN** it MUST be treated as a credit reducing the basis
- **AND** it MUST NOT be recorded as a fee disposal of a negative quantity

#### Scenario: A zero fee is a recorded value, not missing information

- **WHEN** a source writes `fee = 0`, as Kraken does on 22 rows and Bitvavo on 18
- **THEN** it MUST be read as "no fee was charged", a fact
- **AND** it MUST NOT be treated as unknown, flagged, or reported as pending review
- **AND** because `gross = net + 0`, both fee conventions coincide on such a row, so no convention needs establishing for it

#### Scenario: An absent fee is distinguishable from a zero fee

- **WHEN** the same Bitvavo export carries `Fee amount = '0'` on 12 deposits and an empty cell on 11 others
- **THEN** the first MUST reach the ledger as `'0'` and the second as absent
- **AND** the two MUST NOT collapse into one representation

#### Scenario: A fee amount is never persisted without its denomination

- **WHEN** a source records a fee amount but has no fee-currency column, as Kraken spot does
- **THEN** the denomination MUST be resolved as the row's own asset before persistence
- **AND** the row MUST NOT reach the ledger with a fee amount and no fee asset, which both `LedgerSpotTransactionSchema` and the SQLite `CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))` reject

#### Scenario: Fees in different assets are never summed

- **WHEN** two rows being merged carry fees denominated in different assets
- **THEN** they MUST NOT be added into one amount under a single currency label
- **AND** the merge MUST either keep them separate or be rejected

### Requirement: Source Quantities Survive Ingestion Digit for Digit

Every quantity, price, and fee SHALL reach the ledger with the precision the source recorded, carried as a decimal string end to end. No stage SHALL perform arithmetic on a monetary or quantity value as a JavaScript `number`.

A spreadsheet cell's numeric value SHALL be taken from what the file stores, rendered as a plain decimal. It SHALL NOT be taken from how a spreadsheet application would *display* that cell, and SHALL NOT be rounded to any digit count. Excel's General number format carries a display budget of roughly eleven characters and abbreviates beyond it — `149.99999997` displays as `150`, `1244.13519942` as `1244.135199` — so a display rendering is a statement about column width, not about the recorded figure.

Reading a stored double and re-emitting it as a plain decimal is the one permitted `number` round-trip, and only because it is provably lossless: a workbook writer serialises a cell as the shortest decimal string that round-trips to the stored double, and that is exactly what emitting the double as a decimal string produces. Where a source is found whose serialisation does not have this property, the raw stored string SHALL be read directly rather than the rounding being reintroduced.

#### Scenario: A spreadsheet cell is read from what the file stores, not from what it would display

- **WHEN** an `.xlsx` numeric cell is read
- **THEN** the ingested value MUST be the file's own stored figure rendered as a plain decimal
- **AND** a value of more than eleven characters such as `1244.13519942` MUST NOT be shortened to `1244.135199`
- **AND** a near-integer such as `149.99999997` MUST NOT be resolved to `150`
- **AND** a figure the General format would abbreviate to scientific notation, such as `123456789012345`, MUST reach the ledger with every digit

#### Scenario: A long stored figure is not mistaken for a float artefact to be cleaned

- **WHEN** a source stores a figure carrying sixteen or seventeen significant digits, as Bit2Me's euro fee valuations do
- **THEN** the value MUST be ingested as stored, because it is the figure the source recorded
- **AND** it MUST NOT be rounded to a shorter form on the assumption that the extra digits are float noise
- **AND** the parser's output for such a cell MUST agree with the openpyxl-derived domain fixtures in `packages/core-domain/src/__tests__/fixtures/`, which read the same cell straight from the workbook XML

#### Scenario: A sub-microscopic amount is not turned into unparseable notation

- **WHEN** a source records a quantity below `1e-6`, such as `0.00000001 BTC`
- **THEN** the ingested value MUST remain in plain decimal notation
- **AND** it MUST NOT be rendered as `1e-8`, which `preciseAmountSchema` rejects, silently failing the row

#### Scenario: Every real source's amounts are asserted end to end

- **WHEN** the ingestion suite runs
- **THEN** it MUST drive a fixture derived from each real export shape — Kraken spot, Kraken futures, Bitvavo, Bitunix, Bit2Me, Tangem — through the real parser and normalizer
- **AND** assert every amount, fee, and fee denomination digit for digit against the source
- **AND** fail if any source's convention changes without the fixture being updated

#### Scenario: A spreadsheet-reading assertion is not a fixed point of the spreadsheet library

- **WHEN** a test asserts what the `.xlsx` parser yields for a given cell
- **THEN** its expected values MUST be transcribed from the real workbook's stored representation, with the cell address and source file recorded
- **AND** they MUST NOT be derived from reading back a workbook the same library wrote, which can only confirm that library agrees with itself
- **AND** restoring the display-formatting rule MUST make the assertion fail on the specific truncated values, proving the test reaches the code under test

### Requirement: The Type Mapper Never Supplies a Direction the Domain Declined to Determine

Neither `toSpotTxType()` nor `toFuturesTxType()` SHALL map a source label that names an operation without naming its direction. `TRADE` and a bare `TRANSFER` SHALL be rejected rather than resolved, in both markets, because `TransactionNormalizer` preserves a movement's raw label exactly when `classifyCustodyMovement` refused to resolve its direction — so such a label carries that refusal forward.

#### Scenario: A bare `transfer` is not assumed to be inbound

- **WHEN** a spot row arrives with `tx_type = 'transfer'` and no directional form
- **THEN** the row MUST be rejected, naming the value
- **AND** no `spot_transactions` row MUST be written
- **AND** it MUST NOT be recorded as a `TRANSFER_IN`

#### Scenario: A bare `trade` is not assumed to be a purchase

- **WHEN** a spot row arrives with `tx_type = 'trade'`
- **THEN** the row MUST be rejected rather than recorded as a `BUY`

#### Scenario: Directional forms remain accepted

- **WHEN** a row arrives with `transfer_in` or `transfer_out`
- **THEN** it MUST be persisted with the corresponding canonical type

#### Scenario: A futures margin movement is not recorded as a position trade

- **WHEN** a futures row arrives with `tx_type = 'transfer'`
- **THEN** the row MUST be rejected
- **AND** no `futures_transactions` row MUST be written, because recording it as a `TRADE` invents a position that was never opened

#### Scenario: An unmapped futures type is rejected rather than defaulted

- **WHEN** a futures row carries an unrecognised `tx_type`
- **THEN** ingestion MUST reject that row naming the value and its timestamp
- **AND** `toFuturesTxType()` MUST NOT fall back to `'TRADE'`

### Requirement: Unknown Transaction Types Fail Loudly

`toSpotTxType()` SHALL NOT default an unrecognised source value to `'BUY'` or to any other type. An unmapped value SHALL raise a controlled ingestion error naming the offending value and the source row's timestamp.

#### Scenario: Unrecognised source type is rejected

- **WHEN** a CSV row carries `tx_type = 'LIQUIDATION_TRANSFER'` with no mapping
- **THEN** ingestion of that row MUST fail with an error naming the value
- **AND** no `spot_transactions` row MUST be written for it
- **AND** the failure MUST NOT be silently converted into a `BUY` acquisition

#### Scenario: Rejected row does not silently vanish through the policy join

- **WHEN** an unmapped type would otherwise be excluded by the FIFO event policy
- **THEN** the row MUST be reported as rejected at ingestion time rather than persisted and silently ignored downstream

#### Scenario: Batch reports rejected rows without aborting valid ones

- **WHEN** a batch contains both mappable and unmappable rows
- **THEN** the use case MUST report the rejected rows with their reasons in its result
- **AND** MUST persist the valid rows

### Requirement: Deterministic Parser Transaction Identity

CSV parsers SHALL derive transaction identifiers deterministically from source fields. Non-deterministic sources such as `Math.random()` SHALL NOT contribute to any identifier, as this defeats the ledger's `id_hash` idempotency guarantee and makes re-ingestion unsafe.

#### Scenario: Kraken row lacking both txid and refid

- **WHEN** `KrakenSpotCsvParser` encounters a row with neither `txid` nor `refid`
- **THEN** it MUST derive the identifier from a deterministic hash of the row's content
- **AND** re-parsing the same file MUST produce the identical identifier

#### Scenario: Re-importing the same file creates no duplicates

- **WHEN** an identical CSV file is imported twice
- **THEN** the second import MUST insert zero new `spot_transactions` rows

#### Scenario: Manual overrides survive re-ingestion

- **WHEN** a manual override was authored against a transaction and the source CSV is re-ingested
- **THEN** the override MUST still apply, because the transaction identity is unchanged

### Requirement: Sub-Account Resolution From the Source Wallet Column

The ingestion pipeline SHALL resolve each transaction to the correct child account when the source provides a wallet designation, creating the venue parent and child accounts as needed.

#### Scenario: Kraken earn wallet resolves to a child account

- **WHEN** a Kraken row carries `wallet = 'earn'` for the venue `Kraken`
- **THEN** the transaction's `account_id` MUST reference the `Kraken:earn` child account
- **AND** that account MUST have `parent_account_id` referencing `Kraken`

#### Scenario: Absent wallet designation falls back to the venue

- **WHEN** a source row provides no wallet designation
- **THEN** the transaction MUST be attributed to the venue account
- **AND** no child account MUST be fabricated

#### Scenario: Sub-account resolution is deterministic

- **WHEN** the same file is ingested twice
- **THEN** the resolved account identifiers MUST be identical across both runs

### Requirement: Fiat Price Fallback Is Explicit About Failure

When the historical price provider cannot resolve a value, `CsvIngestionUseCase` SHALL persist the transaction with unresolved fiat magnitudes recorded as unresolved rather than as `0`, so that downstream flagging can distinguish "worth nothing" from "unknown".

#### Scenario: Price provider returns no value for a STAKING reward

- **WHEN** the historical price cannot be resolved for a `STAKING` receipt
- **THEN** the transaction MUST be persisted with its fiat magnitudes marked unresolved
- **AND** the derived lot MUST be flagged `MISSING_PRICE`
- **AND** the acquisition MUST NOT silently receive a `0` cost basis presented as genuine

#### Scenario: Currency mismatch between fee and transaction is recorded

- **WHEN** a row's resolved `fiat_currency` differs from its `fee_currency` and no conversion rate is available
- **THEN** the transaction MUST be persisted and its derived events flagged `CURRENCY_MISMATCH`
- **AND** ingestion MUST NOT mix the two currencies into a single arithmetic result

#### Scenario: Unresolved price does not block the batch

- **WHEN** many rows in a batch have unresolvable prices
- **THEN** ingestion MUST complete and persist them
- **AND** the result MUST report the count pending manual review

