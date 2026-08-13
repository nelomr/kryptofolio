# Fiat Exchange Rates Specification

## Purpose

Retaining ECB daily rates as a dated historical ledger, detecting the publication dates missing
from it, and filling exactly those from the ECB archive — on first ingestion and on boot. A rate is
either published or absent; the system never invents one.

## Requirements

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

### Requirement: The FX Ledger Reports Which Dates It Is Missing

The system SHALL be able to compute, for a requested date range and pair, the exact set of dates on
which the ECB published a rate and `exchange_rates` holds none. The set SHALL be derived from the
ECB's own record of its publication dates, never from a weekday or calendar-holiday rule.

#### Scenario: Weekends are not reported as gaps

- **WHEN** the gap set is computed over a range containing a fully covered week
- **THEN** the Saturday and Sunday MUST NOT appear in the set, because the ECB published no rate for
  them

#### Scenario: An ECB holiday is not reported as a gap

- **WHEN** the range contains a weekday on which the ECB published nothing
- **THEN** that date MUST NOT appear in the set

#### Scenario: An interior hole is found

- **WHEN** `exchange_rates` holds continuous coverage either side of a run of missing publication
  dates
- **THEN** exactly those dates MUST be reported
- **AND** dates outside the hole MUST NOT be reported

#### Scenario: A gap earlier than every stored row is found

- **WHEN** the requested range begins before the earliest date held in `exchange_rates`
- **THEN** the publication dates in that earlier span MUST be reported as missing
- **AND** the computation MUST NOT be bounded below by the earliest stored row

#### Scenario: Full coverage reports nothing

- **WHEN** every publication date in the requested range is already held
- **THEN** the set MUST be empty
- **AND** no remote fetch MUST be performed

### Requirement: Missing Dates Are Filled Automatically From ECB History

The system SHALL fill exactly the reported gap set from the ECB's published history, without an
operator running a script. Filling SHALL be idempotent and SHALL insert no date outside the gap set.

#### Scenario: Only the missing dates are written

- **WHEN** a backfill runs against a range whose gap set is three dates
- **THEN** exactly three rows MUST be inserted
- **AND** already-held rows MUST be left untouched

#### Scenario: A completed backfill is a no-op on repeat

- **WHEN** the same backfill is run a second time
- **THEN** it MUST insert nothing
- **AND** it MUST NOT perform a remote fetch

#### Scenario: A rate the ECB never published is never invented

- **WHEN** a requested range extends beyond the ECB's published history
- **THEN** the uncovered span MUST remain absent from `exchange_rates`
- **AND** figures depending on it MUST surface `MISSING_FX_RATE`

### Requirement: A Published Rate Supersedes A Carried-Forward One, And Nothing Else Is Overwritten

Writing a rate SHALL replace an existing row only where the stored row is carried forward and the
incoming row is published for that date. A published rate SHALL never be overwritten, and a published
rate SHALL never be downgraded to a carried-forward one.

#### Scenario: A carried-forward row is corrected by the real publication

- **WHEN** `exchange_rates` holds a row for a date with source `ECB_PRIOR_DAY`, and the backfill
  retrieves the rate the ECB actually published for that date
- **THEN** the stored rate and source MUST be replaced by the published ones
- **AND** the row MUST afterwards be indistinguishable from one written by a direct fetch

#### Scenario: A published rate is never rewritten

- **WHEN** a write presents a rate for a `(date, pair)` already stored with source `ECB`
- **THEN** the stored row MUST be left unchanged
- **AND** this MUST hold even where the incoming rate differs

#### Scenario: A carried-forward rate never replaces a published one

- **WHEN** a carried-forward row is presented for a date already holding a published rate
- **THEN** the write MUST be rejected and the published row retained

### Requirement: The Ledger Holds Only Provenance Values The Port Can Interpret

`exchange_rates.source` SHALL hold only values the FX ledger port defines. A row whose provenance the
port cannot interpret SHALL surface as an error and SHALL NOT be coerced into a recognised value.

The precedence rule of Decision 6 is stated entirely in terms of `ECB` and `ECB_PRIOR_DAY`: a
published fact and a carried-forward approximation. A third value has no defined position in that
ordering, so silently reading it as either one would let an unattributed rate either overwrite a
published fact or claim to be one.

#### Scenario: An unrecognised provenance is refused rather than coerced

- **WHEN** `exchange_rates` holds a row whose `source` is neither `ECB` nor `ECB_PRIOR_DAY`
- **THEN** reading that row MUST raise an error naming the offending value
- **AND** it MUST NOT be silently treated as `ECB`

#### Scenario: The seeding script cannot introduce an uninterpretable provenance

- **WHEN** the ECB seeding script loads a backup file whose `source` column holds a value outside the
  defined set
- **THEN** the script MUST reject that row rather than copy it into the ledger

#### Scenario: The schema documents only the values that exist

- **WHEN** a reader consults the `exchange_rates` schema for the values `source` may take
- **THEN** the documented set MUST match the set the port accepts

### Requirement: Every Ingestion Triggers Coverage Of Its Own Date Range

Whenever transactions are ingested, the system SHALL ensure the FX ledger is asked to cover the span
from the oldest transaction date in that batch through the current date. This SHALL apply to every
ingestion, not only the first, because a later import may reach further back than any before it. The
request SHALL NOT block ingestion.

#### Scenario: An import predating the FX ledger schedules its own backfill

- **WHEN** a CSV whose oldest transaction is dated three years before the earliest row in
  `exchange_rates` is ingested
- **THEN** a backfill covering that transaction's date through today MUST be requested
- **AND** the import MUST complete without waiting for it

#### Scenario: A later import reaching further back extends coverage again

- **WHEN** a first import covering 2024 has already been backfilled, and a second import is then
  ingested whose oldest transaction is dated 2019
- **THEN** a backfill covering 2019 through today MUST be requested
- **AND** it MUST NOT be skipped on the grounds that a backfill has already run
- **AND** the dates already held from the first backfill MUST NOT be refetched

#### Scenario: A failed backfill does not fail the import

- **WHEN** the remote ECB history cannot be retrieved during an import
- **THEN** the ingested rows MUST still be persisted
- **AND** the failure MUST be reported as an incomplete-rates condition, not as an import error

#### Scenario: Completed coverage triggers re-materialisation

- **WHEN** a backfill requested by an import completes and inserted at least one row
- **THEN** the derived FIFO state MUST be re-materialised
- **AND** rows previously flagged `MISSING_FX_RATE` solely for want of those rates MUST lose the flag

#### Scenario: An import already covered schedules no work

- **WHEN** the ingested range is fully covered by `exchange_rates`
- **THEN** no backfill MUST be requested and no re-materialisation MUST be triggered

### Requirement: The Source Document Is Chosen To Cover The Whole Gap Set, Never To Bound It

Choosing which ECB document to fetch SHALL be an efficiency decision only. The chosen document SHALL
cover every date in the gap set; where it does not, the system SHALL escalate to the full historical
archive. A gap set SHALL NOT be truncated, deferred, or silently reduced to fit the document that was
fetched, and coverage SHALL NOT be capped at any fixed recent window.

Whether a document covers the gap set SHALL be determined from the oldest date the fetched document
actually contains, not from an assumed window width.

#### Scenario: A gap older than the bounded document escalates to the full archive

- **WHEN** the gap set's oldest date is three years old
- **THEN** the full historical archive MUST be fetched
- **AND** every date in the gap set MUST be filled, including the oldest

#### Scenario: A short gap does not pull the full archive

- **WHEN** every date in the gap set falls inside the bounded recent document's coverage
- **THEN** the bounded document MUST be used
- **AND** the full archive MUST NOT be downloaded

#### Scenario: Coverage is verified against the document, not assumed

- **WHEN** a bounded document is fetched and its oldest date turns out to be later than the gap set's
  oldest date
- **THEN** the system MUST escalate to the full archive rather than filling only the dates it happened
  to receive
- **AND** it MUST NOT report the gap as closed

#### Scenario: A partially filled gap set remains open

- **WHEN** a backfill fills some but not all of the gap set
- **THEN** the unfilled dates MUST remain in the gap set for a subsequent run
- **AND** the affected figures MUST continue to report as unconvertible until those dates are filled

### Requirement: Boot Repairs Coverage Opened By Downtime

On startup the system SHALL close any gap between the most recent rate it holds and the present,
whatever its width. Where that gap is short it SHALL be closed with a bounded recent-history fetch
rather than the full archive; where it is not, the preceding requirement governs which document is
fetched.

#### Scenario: A week of downtime is repaired on boot

- **WHEN** the backend starts and the newest row in `exchange_rates` is seven days old
- **THEN** the missing publication dates in that span MUST be filled
- **AND** the full historical archive MUST NOT be downloaded for a gap this size

#### Scenario: A long absence is repaired in full on boot

- **WHEN** the backend starts and the newest row in `exchange_rates` is two years old
- **THEN** every missing publication date across those two years MUST be filled
- **AND** the repair MUST NOT be limited to the most recent weeks

#### Scenario: Boot repair does not disturb existing history

- **WHEN** boot repair runs against a ledger holding years of published rates
- **THEN** no row outside the gap set MUST be written
