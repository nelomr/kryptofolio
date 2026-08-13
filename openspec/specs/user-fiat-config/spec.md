# User Fiat Config Specification

## Purpose

Configuring the display currency, and keeping it distinguishable from the currency the data was
recorded in. The setting is a read-time concern: it changes what the user is shown and never what
the ledger stores.

## Requirements

### Requirement: User Base Currency Configuration

The system SHALL allow users to configure and persist their preferred base fiat currency (e.g., USD,
EUR). This setting is the **display currency**: it determines the currency every monetary figure is
presented in, and it never determines the currency any figure is stored in. It SHALL be persisted in
exactly one place — the vault's `user_settings` — and that stored value SHALL be the only source the
read model resolves it from. Changing it SHALL be reversible at any time and SHALL mutate no ledger
or lot record.

#### Scenario: User selects and saves base currency

- **WHEN** the user selects 'EUR' from the currency selector and clicks the 'Save' button in the
  configuration view
- **THEN** the system MUST persist 'EUR' in the vault's `user_settings` as `base_currency`, and apply
  it to future market data normalizations and to every monetary figure the read model returns.

#### Scenario: User sees current exchange rate

- **WHEN** the user views the configuration settings
- **THEN** the system MUST display a subtitle or pre-title showing the currently saved exchange rate
  (e.g., 'USD/EUR = 0.988') retrieved via a mutation/composable.

#### Scenario: Saving the setting changes displayed amounts, not stored ones

- **WHEN** the user switches the base currency and the portfolio is re-read
- **THEN** the displayed monetary amounts MUST change by the applicable exchange rates
- **AND** `spot_transactions.fiat_currency`, `tax_lots.fiat_currency` and every stored amount MUST be
  unchanged

#### Scenario: Switching back restores the previous figures

- **WHEN** the user switches from the stored currency to another and back again
- **THEN** the figures MUST return to their original values, with no residue from a round trip

### Requirement: The Configured Currency Is Distinguished From The Currency Of The Data

The interface SHALL make clear that the selector governs presentation, and SHALL state the rate basis
being applied, so a converted figure is never mistaken for a figure the user's exchange reported.

#### Scenario: A converted view is identifiable as converted

- **WHEN** the display currency differs from the currency the underlying records are stored in
- **THEN** the interface MUST indicate that the amounts shown are converted
- **AND** it MUST be possible to determine which rates were applied

#### Scenario: An unsupported currency is not offered

- **WHEN** the currency selector is rendered
- **THEN** it MUST offer only currencies for which the FX ledger can supply rates
- **AND** selecting a currency the ledger cannot serve MUST NOT be possible
