## ADDED Requirements

### Requirement: Daily FX Rates Are Retained As A Historical Ledger

The system SHALL retain every fetched daily rate as a dated row in `ledger.exchange_rates`, in addition to storing the current rate in the KV store. The existing requirement covers the *current* rate, which can value a figure today; valuing a two-year-old acquisition requires the rate that applied on its own date, and only a dated ledger can supply that.

#### Scenario: The boot fetch writes the FX ledger, not only the KV store

- **WHEN** `FetchAndStoreExchangeRatesUC` retrieves the ECB rate for a publication date
- **THEN** it MUST upsert a row into `exchange_rates` keyed on that date and pair, alongside updating `exchange_rate_usd_eur` in the KV store
- **AND** re-running it for an already-recorded date MUST be idempotent, leaving the stored rate unchanged

#### Scenario: A fresh install has a usable FX history

- **WHEN** the backend runs for the first time against an empty ledger
- **THEN** the system MUST NOT depend on a manually executed script for the FIFO engine to resolve any historical rate
- **AND** the absence of history predating first install MUST surface as `MISSING_FX_RATE` on the affected rows, never as a silent zero

#### Scenario: Backfilling history predating first install

- **WHEN** an operator needs rates older than the first boot
- **THEN** the seeding path MUST remain available and MUST be idempotent against rows the running system already wrote

### Requirement: A Rate Row Records Its Own Provenance

Each retained rate SHALL record where it came from, distinguishing a rate the ECB published for that date from one carried forward because the ECB published none — weekends and holidays have no publication, and a carried-forward rate is an approximation a reader is entitled to see.

#### Scenario: A carried-forward rate is distinguishable

- **WHEN** a rate row exists for a date the ECB did not publish on
- **THEN** its `source` MUST identify it as carried forward rather than published
- **AND** a figure converted at such a rate MUST remain reproducible from the row
