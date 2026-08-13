# Fiscal Integrity Specification

## Purpose

Surfacing consistency warnings so an incomplete figure is never presented as complete.

## Requirements

### Requirement: Display Consistency Warnings
The system SHALL display the "Fiscal Hospital" logic detailing any warnings or alerts regarding fiscal data consistency. The warnings SHALL be sourced exclusively from the backend's data-quality view via a Zod-validated DTO, and SHALL be grouped by the canonical data-quality vocabulary with a per-flag count, a severity, and an i18n-resolvable detail key. The component SHALL NOT derive or infer warnings from portfolio data on the client side. Rows requiring a value SHALL be presented as pending review with an affordance to assign that value by hand, and no warning SHALL block access to the portfolio or the tax report.

#### Scenario: Integrity issues are detected
- **WHEN** there are integrity warnings passed to the component
- **THEN** the IntegrityCard displays a list of warnings or a health status indicator.

#### Scenario: Missing price data is reported as pending review

- **WHEN** the backend reports rows carrying `quality_flag = 'MISSING_PRICE'`
- **THEN** the IntegrityCard MUST display the affected asset and transaction count
- **AND** MUST state that the affected events are excluded from the tax base
- **AND** MUST offer a path to assign a value by hand

#### Scenario: Assigning a value clears the warning

- **WHEN** the user assigns a value to a pending row and materialisation completes
- **THEN** the pending count MUST decrease
- **AND** that row MUST no longer be listed

#### Scenario: Positive custody residual is reported at low severity

- **WHEN** a synthetic `ownwallet-<ASSET>` account holds a positive residual beyond the asset's fee-scale tolerance
- **THEN** the IntegrityCard MUST report it under `CUSTODY_RESIDUAL` at low severity with the asset and quantity
- **AND** MUST explain that the quantity is either self-custodied or an unrecorded network fee

#### Scenario: Untracked inflow is reported at high severity

- **WHEN** a synthetic `ownwallet-<ASSET>` balance is negative
- **THEN** the IntegrityCard MUST report it under `UNTRACKED_INFLOW` at the highest severity
- **AND** MUST state that a holding exists with no established cost basis
- **AND** MUST offer a path to declare the movement's source account

#### Scenario: Custody imbalance is reported

- **WHEN** aggregated custody diverges from an account's on-ledger balance
- **THEN** the IntegrityCard MUST report it under `CUSTODY_IMBALANCE` with the account and asset

#### Scenario: Negative cost basis is reported as a data defect

- **WHEN** any lot carries a negative `unit_cost_fiat`
- **THEN** the IntegrityCard MUST report it under `NEGATIVE_COST_BASIS` at the highest severity
- **AND** MUST indicate that gains derived from those lots are suppressed

#### Scenario: Currency mismatch is reported

- **WHEN** transactions carry `quality_flag = 'CURRENCY_MISMATCH'`
- **THEN** the IntegrityCard MUST report both currencies involved
- **AND** MUST state that no conversion was applied

#### Scenario: Retired orphan lots are reported after a rebuild

- **WHEN** a rebuild soft-deletes lots whose source transactions no longer exist
- **THEN** the IntegrityCard MUST report the retired count under `ORPHAN_LOT`

#### Scenario: Pending recalculation is indicated

- **WHEN** `needs_recalculation` is `'true'`
- **THEN** the IntegrityCard MUST indicate that derived figures are pending recalculation
- **AND** MUST offer the explicit rebuild action

#### Scenario: Clean ledger shows a healthy state

- **WHEN** the backend returns zero data-quality rows
- **THEN** the IntegrityCard MUST display a healthy status indicator and no warning list

#### Scenario: Warnings are fetched and mutated declaratively

- **WHEN** the integrity data is loaded
- **THEN** it MUST be fetched through a Pinia Colada `useQuery` composable
- **AND** value assignments MUST be submitted through a `useMutation` composable
- **AND** neither MUST be held in a global Pinia state store
