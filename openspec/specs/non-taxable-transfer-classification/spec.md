# Non Taxable Transfer Classification Specification

## Purpose

A movement between the user's own accounts is not a disposal: fiat asset classification, explicit custody types from the normalizer, and fiscal meaning derived rather than read from the source.

## Requirements

### Requirement: Fiat Asset Classification

The `assets` table SHALL carry an `is_fiat` flag identifying assets that are units of account rather than taxable holdings. The FIFO engine SHALL exclude fiat assets from lot creation and lot consumption entirely.

#### Scenario: Fiat deposit is not a crypto acquisition

- **WHEN** a `DEPOSIT` of 500 EUR into an exchange is ingested and `assets.is_fiat = 1` for EUR
- **THEN** `v_flattened_fifo_events` MUST emit no event for it
- **AND** no tax lot MUST be created for EUR

#### Scenario: Fiat classification is seeded for known currencies

- **WHEN** the `004_fifo_traceability.sql` migration runs
- **THEN** `is_fiat` MUST be set to `1` for every asset whose symbol is a recognised ISO-4217 code present in the ledger (at minimum EUR, USD, GBP, CHF)
- **AND** default to `0` for all other assets

#### Scenario: Ingestion assigns fiat classification

- **WHEN** `ensureAssetExists` is called for a symbol
- **THEN** it MUST resolve and persist `is_fiat` from the ISO-4217 code list rather than leaving it unset

### Requirement: Custody Movement Is Not a Disposal

A transfer of a crypto asset between accounts belonging to the same user SHALL be classified as a non-taxable custody movement. The transferred principal SHALL NOT consume tax lots, SHALL NOT create tax lots, and SHALL NOT produce a `lot_history_event`.

#### Scenario: Withdrawal from an exchange to a self-custody wallet

- **WHEN** 179.11 XRP is withdrawn from Kraken and deposited into a Ledger wallet
- **THEN** no `lot_history_event` MUST be generated for the 179.11 XRP
- **AND** the originating lot's `remaining_qty` MUST be unchanged
- **AND** the lot's `status` MUST remain `OPEN`

#### Scenario: Ledger with only transfers reports zero capital gains

- **WHEN** a ledger contains `BUY`, `DEPOSIT`, `WITHDRAWAL`, and `STAKING` transactions but zero `SELL`, `SWAP`, or `SPEND` transactions
- **THEN** the sum of `gain_loss_fiat` over all `lot_history_events` whose `disposal_type` is `SELL` or `SWAP` MUST be exactly `0`
- **AND** the only events present MUST have `disposal_type = 'FEE'`

#### Scenario: Deposit does not create a phantom zero-cost lot

- **WHEN** 179.11 XRP arrives via `DEPOSIT` on a wallet account
- **THEN** no new tax lot MUST be created with `unit_cost_fiat = 0`
- **AND** the total count of XRP lots MUST equal the count of genuine XRP acquisitions (`BUY`, `SWAP`, `STAKING`, `AIRDROP`, `REWARD`, `MINING`)

### Requirement: Normalizer Emits Explicit Custody Types

The `TransactionNormalizer` SHALL classify raw source rows into custody-movement types rather than mapping `deposit`/`withdrawal` verbatim when the moved asset is not fiat. The classification SHALL be a pure domain function with no framework dependency.

#### Scenario: Kraken crypto withdrawal row

- **WHEN** a Kraken row with `type = 'withdrawal'`, `subclass = 'crypto'`, `asset = 'XRP'` is normalized
- **THEN** the resulting `tx_type` MUST be `TRANSFER_OUT`

#### Scenario: Kraken fiat deposit row

- **WHEN** a Kraken row with `type = 'deposit'`, `subclass = 'fiat'`, `asset = 'EUR'` is normalized
- **THEN** the resulting `tx_type` MUST be `DEPOSIT`
- **AND** the FIFO engine MUST ignore it by virtue of the fiat classification

#### Scenario: Classification remains domain-pure

- **WHEN** the custody classification module under `packages/core-domain/src/domain/` is inspected
- **THEN** it MUST NOT import Zod, Axios, Vue, or any database driver
- **AND** `scripts/check-domain-isolation.sh` MUST pass

### Requirement: Source Fidelity Is Preserved; Fiscal Meaning Is Derived

The ledger SHALL record the transaction type the source reported. Fiscal meaning SHALL be derived at query time from the moved asset's `is_fiat` flag and the FIFO event policy, never by rewriting the stored `tx_type`.

#### Scenario: Exchange-reported type is stored unchanged

- **WHEN** an exchange reports a crypto movement as `withdrawal`
- **THEN** the ledger MAY store it as `WITHDRAWAL` or as `TRANSFER_OUT` per the normalizer's classification
- **AND** whichever is stored, the derived fiscal treatment MUST be identical: no principal disposal, fee extracted, custody recorded

#### Scenario: Crypto DEPOSIT row is treated as custody without rewriting

- **WHEN** a `DEPOSIT` row moving a non-fiat asset is evaluated
- **THEN** it MUST be treated as a non-taxable custody movement
- **AND** its stored `tx_type` MUST NOT be mutated to achieve that treatment

#### Scenario: Fiscal treatment is reproducible from stored data alone

- **WHEN** the ledger and the override tables are the only inputs available
- **THEN** the full fiscal treatment MUST be derivable without consulting any prior derived state
