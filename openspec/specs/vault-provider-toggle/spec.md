# vault-provider-toggle Specification

## Purpose
TBD - created by archiving change vault-provider-toggle. Update Purpose after archive.
## Requirements
### Requirement: Vault Status payload includes enabled services
The system SHALL return the list of configured services and the list of enabled services when querying the vault status.

#### Scenario: Vault status is queried
- **WHEN** a client requests the vault status
- **THEN** the API returns `{ isUnlocked: boolean, configuredServices: string[], enabledServices: string[] }`

