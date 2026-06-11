# dynamic-vault-registry Specification

## Purpose
TBD - created by archiving change dynamic-vault-registry. Update Purpose after archive.
## Requirements
### Requirement: Server-Driven Vault Registry
The system SHALL expose an endpoint that provides the definition of all supported integration services (Vault Providers). The frontend MUST use this registry to dynamically render configuration forms without hardcoding service-specific knowledge.

#### Scenario: Fetching Providers
- **WHEN** a client requests `GET /api/credentials/vault/providers`
- **THEN** the API returns an array of `VaultProvider` objects, containing IDs, names, descriptions, and required fields.

#### Scenario: Dynamic Form Rendering
- **WHEN** the frontend receives the list of `VaultProviders`
- **THEN** it renders a settings card for each provider, generating input fields dynamically based on the `fields` array (e.g., type "password", type "text").

### Requirement: Flexible Payload Storage
The API layer MUST allow clients to submit complex configuration objects (JSON payloads) rather than just single string tokens, allowing a single service to require multiple credentials.

#### Scenario: Submitting Complex Configurations
- **WHEN** a client sends a POST request to `/api/credentials/vault/:service` with a JSON body containing multiple fields (e.g., `apiKey` and `apiSecret`)
- **THEN** the backend validates and stores the entire payload as a single encrypted artifact for that service.

