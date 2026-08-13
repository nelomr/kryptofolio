# Display Currency Conversion Specification

## Purpose

Resolving every monetary figure in the read model into the user's selected display currency, at a
rate dated to the figure itself. Conversion is arithmetic applied per row before any aggregation,
it is a read-time concern that never touches the stored ledger, and a figure it cannot express
reports that rather than passing through at a factor of one.

## Requirements

### Requirement: A Monetary Figure Is Converted, Not Relabelled

Every monetary figure the read model returns SHALL be the product of its stored value and a resolved
exchange rate for `<native currency>/<display currency>`, or SHALL be its stored value under a factor
of exactly `1` where the two currencies match. The display currency SHALL NOT appear in a query
solely as a projected label alongside an unconverted value.

#### Scenario: A holding stored in euro is displayed in dollars

- **WHEN** an open lot holds a cost basis of `1000 EUR`, the display currency is `USD`, and the FX
  ledger resolves `EUR/USD = 1.088` at that lot's acquisition date
- **THEN** the returned `cost_basis_fiat` MUST be `1088` at the engine's stated precision
- **AND** the returned `currency` MUST be `USD`
- **AND** the returned value MUST differ from the stored `1000`

#### Scenario: The KPI figures are converted by the same rule

- **WHEN** the portfolio summary is requested with a display currency differing from the currencies
  its lots are stored in
- **THEN** `total_equity_fiat`, `total_cost_basis_fiat`, `total_realized_pnl_fiat` and
  `total_unrealized_pnl_fiat` MUST each be converted
- **AND** a KPI query MUST NOT accept the display currency as an argument it does not read

### Requirement: Conversion To The Same Currency Is The Identity

Where a figure's native currency equals the display currency, the conversion factor SHALL be the
literal `1` and no row of `exchange_rates` SHALL be read. A figure SHALL NOT be routed through an
intermediate currency and back.

#### Scenario: A dollar figure displayed in dollars is unchanged bit for bit

- **WHEN** a lot's stored cost basis is `1234.567890123456 USD` and the display currency is `USD`
- **THEN** the returned figure MUST be exactly `1234.567890123456`
- **AND** the query MUST NOT read `exchange_rates` for that figure

#### Scenario: Switching away and back restores the original figure

- **WHEN** the same portfolio is requested in `EUR`, then in `USD`, where the lots are stored in `USD`
- **THEN** the second response MUST equal the response obtained with no conversion applied at all

### Requirement: A Figure About The Past Is Converted At A Rate From The Past

A figure describing a completed event SHALL be converted at the rate resolved for that event's own
date, never at the latest rate. A figure describing the present SHALL be converted at the latest rate
available in the FX ledger. Rate resolution SHALL be backward-looking: the most recent rate on or
before the target date, never a later one.

#### Scenario: Two lots of the same asset convert at different rates

- **WHEN** one lot was acquired on a date where `EUR/USD = 1.05` and another on a date where
  `EUR/USD = 1.15`, both stored in `EUR`, and the display currency is `USD`
- **THEN** each lot's cost basis MUST be converted at its own date's rate
- **AND** the two MUST NOT share a single rate

#### Scenario: A realized gain converts at its disposal date

- **WHEN** a disposal recorded on `2024-03-14` produced a realized gain stored in `EUR`
- **THEN** that gain MUST be converted at the rate resolved for `2024-03-14`
- **AND** it MUST NOT be converted at the latest rate held in the ledger

#### Scenario: Present value uses the latest rate

- **WHEN** current value and total equity are computed from live prices
- **THEN** they MUST be converted at the most recent rate in `exchange_rates`
- **AND** that rate's date MUST be reported alongside the figures

#### Scenario: A weekend acquisition resolves the preceding published rate

- **WHEN** a lot was acquired on a Sunday for which `exchange_rates` holds no published row and the
  most recent preceding row is the Friday
- **THEN** the conversion MUST use the Friday rate

### Requirement: Unrealized PnL Is Derived From Converted Terms, Not Converted Itself

Unrealized PnL SHALL be computed as the difference between the converted current value and the
converted cost basis. It SHALL NOT be converted as a figure in its own right.

#### Scenario: The three displayed figures reconcile

- **WHEN** current value, cost basis and unrealized PnL are returned together in a display currency
  differing from the native one
- **THEN** `unrealized_pnl_fiat` MUST equal `current_value_fiat − cost_basis_fiat` at the engine's
  stated precision
- **AND** this MUST hold even though the two operands were converted at different dates

#### Scenario: FX movement is visible in the converted result

- **WHEN** a position whose value is unchanged in `EUR` is displayed in `USD`, and `EUR/USD` has moved
  between the acquisition date and today
- **THEN** the reported PnL in `USD` MUST be non-zero
- **AND** it MUST NOT equal the `EUR` PnL multiplied by any single rate

### Requirement: A Converted Amount Declares Its Outcome As A Closed Set

A monetary figure crossing the read boundary SHALL declare its conversion outcome as one of exactly
three states — converted, native, or unconvertible — carrying the data that state implies. It SHALL
NOT be represented as an amount plus a nullable rate plus a boolean, a shape that admits combinations
with no meaning.

#### Scenario: A converted figure carries its rate and rate date

- **WHEN** a figure is converted from its native currency to the display currency
- **THEN** it MUST report the rate applied and the date that rate is dated to
- **AND** recomputing the product from the native amount and the reported rate MUST reproduce the
  figure at the engine's stated precision

#### Scenario: A native figure is distinguishable from one converted at a rate of one

- **WHEN** a figure's native currency already equals the display currency
- **THEN** its state MUST be the native state
- **AND** it MUST NOT be reported as converted with a rate of `1`

#### Scenario: An unconvertible figure still reports its native amount

- **WHEN** no rate can be resolved for a figure
- **THEN** it MUST report the unconvertible state carrying the native amount and native currency
- **AND** the native amount MUST NOT be blanked, zeroed, or presented in the requested currency

### Requirement: An Unconvertible Figure Is Reported, Never Guessed

The system SHALL report a figure as unconvertible where a conversion is required and no rate can be
resolved on or before that figure's date, and SHALL NOT substitute a factor of `1`, the latest rate,
or a fabricated value.

#### Scenario: A lot older than the FX ledger

- **WHEN** a lot's acquisition date precedes the earliest row in `exchange_rates` for the required
  pair, and the display currency differs from the lot's native currency
- **THEN** the figure MUST be reported as unconvertible
- **AND** the latest rate MUST NOT be used in place of the missing historical one

#### Scenario: A display failure is not recorded as a lot quality defect

- **WHEN** a figure cannot be converted for display
- **THEN** the lot's persisted `quality_flag` MUST NOT be set or altered
- **AND** the same lot requested in its own native currency MUST report no defect
- **AND** the unconvertible state MUST NOT be a member of the `FIFO_QUALITY_FLAGS` vocabulary

#### Scenario: A genuine missing-rate defect survives alongside it

- **WHEN** a lot already carries a persisted `MISSING_FX_RATE` from materialisation
- **THEN** that flag MUST continue to be reported independently of the display conversion outcome
- **AND** the two MUST be separately readable, never collapsed into one signal

#### Scenario: An incomplete total is not silently summed

- **WHEN** a portfolio total aggregates lots of which at least one could not be converted
- **THEN** the response MUST indicate that the total is incomplete
- **AND** the unconvertible lot MUST NOT contribute a zero that reads as a genuine zero

### Requirement: The Display Currency Reaches The Read Model From One Source

The display currency SHALL be resolved from the vault's `base_currency` setting and passed to every
read query as a bound parameter. No analytical query SHALL read a display currency from a store other
than the one the settings API writes to.

#### Scenario: Changing the setting changes the figures on the next read

- **WHEN** the user saves `EUR` through the settings API and the portfolio summary is re-requested
- **THEN** the returned figures MUST be euro figures
- **AND** no restart, rebuild or cache invalidation beyond the ordinary query refresh MUST be required

#### Scenario: No second copy of the setting exists

- **WHEN** the DuckDB analytical database is inspected after initialisation
- **THEN** it MUST NOT contain a `user_settings` table of its own
- **AND** no view MUST resolve its target currency from anything other than a bound parameter

### Requirement: Conversion Precision Is Bounded And Declared

Conversion SHALL be performed in decimal arithmetic, never in floating point, and its result SHALL
satisfy the numeric string constraints of any column it is written to. A converted figure SHALL NOT
be emitted in scientific notation. A monetary amount SHALL NOT be produced by a multiplication or a
summation evaluated in floating point: a decimal rate applied on top of a product already computed in
floating point does not satisfy this requirement.

Where the analytical engine cannot return an exact decimal — division, mean, standard deviation and
square root each return a floating-point type in DuckDB regardless of their operands — the result
SHALL be explicitly bounded and SHALL NOT be used as a cost basis or as a figure in the tax report.

#### Scenario: A monetary product carrying a conversion is exact

- **WHEN** a cost basis, current value or PnL is computed by multiplying or summing amounts, with a
  conversion applied
- **THEN** every operand and intermediate product MUST be evaluated in decimal arithmetic
- **AND** the decimal scale of each product MUST be chosen explicitly rather than left to the
  engine's default

#### Scenario: An engine-forced floating-point result is bounded and never a basis

- **WHEN** a figure can only be obtained through an operation the engine evaluates in floating point
- **THEN** its precision MUST be explicitly bounded at the point of use
- **AND** it MUST NOT be used as a cost basis, a disposal value, or any figure the tax report reads

#### Scenario: An existing floating-point money expression is not built upon

- **WHEN** a conversion is added to an expression that currently computes money through `DOUBLE`
- **THEN** that expression MUST be converted to decimal arithmetic as part of the same work
- **AND** a test asserting decimal behaviour MUST NOT pass over an expression that remains floating
  point beneath it

#### Scenario: A small converted figure stays a plain decimal

- **WHEN** a converted unit cost is of the order of `1e-9`
- **THEN** the emitted value MUST be a plain decimal string

#### Scenario: A non-zero figure does not round to zero unflagged

- **WHEN** a converted figure is non-zero but below the emitted precision
- **THEN** it MUST be flagged rather than presented as `0`

### Requirement: The Rate-Date Rule Is Defined Once, Outside The Query Layer

The rule mapping a class of figure to the date its rate is resolved at SHALL be defined once as pure,
framework-free logic in the shared domain package, and SHALL be consumed by the adapters rather than
restated in each query. An adapter SHALL apply a rate basis it is given; it SHALL NOT decide one.

#### Scenario: The rule is testable without a database

- **WHEN** the mapping from figure class to rate basis is exercised
- **THEN** it MUST be assertable as a pure function, with no database, no SQL and no adapter involved
- **AND** the domain module defining it MUST import no query builder, no Zod schema and no arithmetic
  library

#### Scenario: Adding a figure class does not require editing every query

- **WHEN** a new class of monetary figure is introduced
- **THEN** its rate basis MUST be declared in the single domain definition
- **AND** no adapter MUST need a rule of its own to handle it

#### Scenario: Single-figure conversion reuses the existing converter

- **WHEN** a single monetary figure is converted outside a set-based query
- **THEN** it MUST use the shared money and conversion value objects already provided by the domain
  package
- **AND** a second implementation of rate multiplication MUST NOT be introduced

### Requirement: The Aggregated Valuation Series Declares Its Canonical Unit

The daily valuation series SHALL aggregate assets in a single canonical currency before summing, and
SHALL convert that canonical total to the display currency at each point's own date. The canonical
currency SHALL be `EUR`, because the FX ledger is ECB-quoted and `EUR` is reachable from any
supported currency by a published rather than an inverted rate.

#### Scenario: Each point of the series uses its own date's rate

- **WHEN** a daily valuation series spanning a period of FX movement is requested in `USD`
- **THEN** each daily point MUST be converted at the rate resolved for that point's date
- **AND** the series MUST NOT be scaled by a single rate applied uniformly

#### Scenario: A price of unknown currency is not assumed to be in the target currency

- **WHEN** a price row carries no currency and contributes to an aggregated valuation
- **THEN** its contribution MUST be reported as unconvertible
- **AND** it MUST NOT be assumed to be denominated in the canonical currency, the display currency,
  or any other currency by default

#### Scenario: The series path is not used for readable figures

- **WHEN** a cost basis, a realized gain or a tax report figure is produced
- **THEN** it MUST be converted by a single direct or reciprocal hop from its native currency
- **AND** it MUST NOT be routed through the canonical aggregation currency

### Requirement: A Per-Event Figure Carries Its Own Conversion Outcome

Every monetary figure reported for a single disposal event SHALL declare its own conversion outcome,
and SHALL NOT be named for a currency it is not guaranteed to be in. A per-event figure and the
declared total it contributes to SHALL be expressed in the same currency.

The read that materialises the ledger SHALL remain unconverted. A display conversion SHALL NOT be
reachable from the path that persists, in any currency.

#### Scenario: A disposal converts at its own date

- **WHEN** a disposal recorded in `USD` is read for display in `EUR`
- **THEN** its figure MUST report as converted at that disposal's own date
- **AND** it MUST carry the rate and rate date it used
- **AND** two disposals of different dates MUST convert at different rates

#### Scenario: The same disposal read natively declares no conversion

- **WHEN** that disposal is read in the currency it was recorded in
- **THEN** its figure MUST report as native
- **AND** no rate MUST be applied to it

#### Scenario: A disposal no rate reaches is reported, not shaded

- **WHEN** no stored rate covers a disposal's date in the requested currency
- **THEN** its figure MUST report as unconvertible, carrying its native amount and currency
- **AND** it MUST NOT be rendered as a gain, a loss, or a zero

#### Scenario: The rows and the declared total agree

- **WHEN** the per-event figures of a period and that period's declared base are read in the same
  currency
- **THEN** the figures MUST sum to the declared base
- **AND** any difference MUST be attributable to events the period reports as unconvertible

#### Scenario: The persisting read is never converted

- **WHEN** the method that feeds materialisation is called while a display currency is configured
- **THEN** the figures it returns MUST be the native ones
- **AND** no converted figure MUST be persisted to the ledger
