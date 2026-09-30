# dynamic-vault-registry Specification

## Purpose
TBD - created by archiving change dynamic-vault-registry. Update Purpose after archive.
## Requirements
### Requirement: Server-Driven Vault Registry
The system SHALL expose an endpoint that provides the definition of all supported integration services (Vault Providers). The frontend MUST use this registry to dynamically render configuration forms without hardcoding service-specific knowledge.

Every `VaultProvider` SHALL additionally carry a discriminated `category` field of the form `{ kind: 'exchange' } | { kind: 'market-data' } | { kind: 'ai-model' }`, so consumers can group providers and enumerate a single category without inferring one from a provider id. AI model providers SHALL be entries in this same registry, governed by the existing encrypted-vault rules; no parallel secrets mechanism SHALL be introduced for them.

#### Scenario: Fetching Providers
- **WHEN** a client requests `GET /api/credentials/vault/providers`
- **THEN** the API returns an array of `VaultProvider` objects, containing IDs, names, descriptions, required fields, and a discriminated `category`.

#### Scenario: Dynamic Form Rendering
- **WHEN** the frontend receives the list of `VaultProviders`
- **THEN** it renders a settings card for each provider, generating input fields dynamically based on the `fields` array (e.g., type "password", type "text").

#### Scenario: Providers are grouped by category
- **WHEN** the credentials settings view renders the registry
- **THEN** providers are grouped by `category.kind`, and AI model providers appear in their own group

#### Scenario: AI providers are enumerable in isolation
- **WHEN** the advisor needs the set of AI model providers
- **THEN** it filters the registry on `category.kind === 'ai-model'` and matches no exchange or market-data provider

#### Scenario: Every existing provider declares a category
- **WHEN** `GetAvailableProvidersUseCase` output is inspected
- **THEN** every entry — pre-existing and newly added — carries a `category`, and a missing `category` is a compile-time error rather than a runtime default

#### Scenario: AI keys are stored through the existing encrypted path
- **WHEN** a client POSTs an AI provider key to `/api/credentials/vault/:service`
- **THEN** it is encrypted and stored in `system_credentials` under that `service_identifier` by the existing vault code path, with no schema migration required

#### Scenario: An unregistered AI provider is still rejected
- **WHEN** a client POSTs credentials for an AI provider id absent from the registry
- **THEN** the request is rejected with `UNKNOWN_PROVIDER`, exactly as for any other unregistered service

### Requirement: Flexible Payload Storage
The API layer MUST allow clients to submit complex configuration objects (JSON payloads) rather than just single string tokens, allowing a single service to require multiple credentials.

#### Scenario: Submitting Complex Configurations
- **WHEN** a client sends a POST request to `/api/credentials/vault/:service` with a JSON body containing multiple fields (e.g., `apiKey` and `apiSecret`)
- **THEN** the backend validates and stores the entire payload as a single encrypted artifact for that service.

