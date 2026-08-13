# Market Data Orchestration Specification

## Purpose

One active market provider at a time, toggled through vault settings.

## Requirements

### Requirement: Mutually Exclusive Provider Activation
The system SHALL ensure that only one market data provider is active at any given time per category (`crypto`, `general`).

#### Scenario: Activating a provider when another is already active
- **WHEN** a user activates the Kraken provider for the `crypto` category
- **THEN** the system MUST gracefully disconnect the currently active `crypto` provider (if any) and start the Kraken provider.

### Requirement: Toggle Provider via Vault Settings
The system SHALL expose a UI mechanism within the Vault settings allowing the user to set a vault as the active market data provider.

#### Scenario: User toggles a vault as the provider
- **WHEN** the user enables the "Use this Vault as Market Data Provider" toggle
- **THEN** the system MUST persist this configuration and notify the Market Data Orchestrator to switch the active provider for the corresponding category.
