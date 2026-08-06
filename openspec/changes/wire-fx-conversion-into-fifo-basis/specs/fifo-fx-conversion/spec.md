## ADDED Requirements

### Requirement: Historical Price Conversion To The Reporting Currency

The FIFO engine SHALL convert a historical market price into the transaction's `fiat_currency` before that price becomes a cost basis or a disposal value, whenever the price series is denominated in a different currency. Conversion SHALL use the daily rate held in `ledger.exchange_rates` for the pair `<series currency>/<reporting currency>`, resolved at the transaction's own date. A price already denominated in the reporting currency SHALL pass through untouched, with no rate lookup.

#### Scenario: A USD series values a euro-reporting acquisition

- **WHEN** a `STAKING` acquisition of `0.0789135 B2M` on `2024-12-05` has no recorded fiat total, its resolved series price is `0.015692281 USD`, the transaction's `fiat_currency` is `EUR`, and `exchange_rates` holds `USD/EUR = 0.918695` for that date
- **THEN** the acquisition's `unit_cost_fiat` MUST be the euro figure `0.015692281 × 0.918695`
- **AND** the lot MUST carry no `CURRENCY_MISMATCH` flag
- **AND** `unit_cost_fiat` MUST NOT be masked to `0`

#### Scenario: A series already in the reporting currency is not converted

- **WHEN** a resolved series price is denominated in `EUR` and the transaction's `fiat_currency` is `EUR`
- **THEN** the price MUST be used as it stands
- **AND** no row of `exchange_rates` MUST be required for the valuation to succeed

#### Scenario: A recorded fiat total is never converted

- **WHEN** a transaction states its own `total_fiat` in its `fiat_currency`
- **THEN** that figure MUST be used as the basis unchanged, and no conversion MUST be attempted
- **AND** this MUST hold even where a rate exists, because the source's own figure is already in the reporting currency

### Requirement: Rate Resolution Is Backward-Looking And Dated

A rate SHALL be resolved as the most recent rate on or before the transaction's date, never a later one. A conversion SHALL NOT use a rate published after the event it values.

#### Scenario: A weekend acquisition uses the preceding published rate

- **WHEN** an acquisition falls on a date for which `exchange_rates` holds no row, and the most recent preceding row is two days earlier
- **THEN** the conversion MUST use that preceding rate

#### Scenario: A rate later than the transaction is never used

- **WHEN** the earliest row in `exchange_rates` for the required pair is dated after the transaction
- **THEN** no rate MUST be considered resolved for that transaction
- **AND** the valuation MUST follow the missing-rate requirement below

### Requirement: A Missing Rate Is Reported As Its Own Defect

Where a conversion is required and no rate can be resolved, the engine SHALL flag the affected rows with `MISSING_FX_RATE` rather than `CURRENCY_MISMATCH`, and SHALL NOT invent a rate, fall back to `1`, or use the current rate in place of a historical one. The two conditions are distinct: no rate held for a pair and date is a gap in reference data, whereas a currency disagreement the engine refuses to resolve is a policy decision.

#### Scenario: No rate exists for the required pair

- **WHEN** a valuation needs a `GBP/EUR` rate and `exchange_rates` holds only `USD/EUR`
- **THEN** the derived rows MUST carry `quality_flag = 'MISSING_FX_RATE'` and `is_taxable = 0`
- **AND** the basis MUST be masked exactly as any other unresolvable value

#### Scenario: The current rate is not substituted for a historical one

- **WHEN** the FX ledger holds no rate for a 2024 transaction but the KV store holds today's rate
- **THEN** the current rate MUST NOT be used
- **AND** the row MUST be flagged `MISSING_FX_RATE`

### Requirement: Conversion Applies At Every Valuation Site

The conversion SHALL be applied wherever a series price becomes a monetary figure: the acquisition price, the disposal price, and the price of a fee denominated in an asset. A fee disposal SHALL be valued in the reporting currency by the same rule as the transaction that incurred it.

#### Scenario: A crypto fee on a euro-reporting buy is valued in euro

- **WHEN** a Bit2Me buy reporting in `EUR` charges `0.204766 XRP` in fees and the XRP series is denominated in `USD`
- **THEN** the fee's disposal value and the fee component of the acquisition basis MUST both be euro figures converted at the transaction's date
- **AND** the two MUST use the same resolved rate, so the fee cannot be valued at one rate as an expense and another as a disposal

#### Scenario: A disposal and its matched lot are stated in one currency

- **WHEN** a disposal is matched against a lot whose basis was converted
- **THEN** the gain MUST be the difference of two figures in the same reporting currency
- **AND** a gain MUST NOT be computed from a basis and a proceed denominated differently

### Requirement: A Converted Figure Carries Its Rate

A monetary figure produced by conversion SHALL record the rate and the rate date used, so the figure can be reproduced from reference data years later. The provenance SHALL distinguish a converted market value from a directly observed one.

#### Scenario: An audited lot states how its basis was derived

- **WHEN** a lot's basis was obtained by converting a USD series price
- **THEN** the persisted lot MUST state the rate applied and the date that rate was published
- **AND** a reader MUST be able to tell it apart from a lot valued from a series already in the reporting currency

#### Scenario: Reproducing a figure from the audit trail

- **WHEN** a stored basis, its quantity, its series price and its recorded rate are read back
- **THEN** recomputing the product MUST reproduce the stored basis to the engine's stated precision

### Requirement: Conversion Precision Is Explicit

The conversion SHALL be performed at the engine's decimal precision, not at float precision, and its output SHALL satisfy the SQLite ledger's string-formatted numeric constraints. A converted value SHALL NOT reach SQLite in scientific notation.

#### Scenario: A small converted value is not written in scientific notation

- **WHEN** a converted unit cost is of the order of `1e-9`
- **THEN** the value written to SQLite MUST be a plain decimal string satisfying the column's `GLOB` constraint

#### Scenario: Conversion does not round a basis to zero

- **WHEN** a converted unit cost is non-zero but smaller than the formatting precision currently applied by the engine
- **THEN** the persisted figure MUST NOT be `0` while the lot carries no flag
- **AND** a value the engine cannot represent MUST be flagged rather than stored as a silent zero
