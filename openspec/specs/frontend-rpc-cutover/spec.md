# Frontend Rpc Cutover Specification

## Purpose

Fetching through Hono RPC, with the anti-corruption layer enforced at that boundary.

## Requirements

### Requirement: Hono RPC Data Fetching
All frontend infrastructure adapters SHALL utilize the typed Hono RPC client (`apiClient`) to perform data fetching from the BFF, eliminating any direct usage of Axios, `fetch`, or local mock data modules.

#### Scenario: Frontend requests data
- **WHEN** a domain port method is invoked via its infrastructure adapter
- **THEN** the adapter calls the appropriate `apiClient.api.route.$get()` method instead of a raw network request

### Requirement: Anti-Corruption Layer Enforcement
All frontend infrastructure adapters SHALL validate the responses received from the Hono RPC client against Zod DTO schemas before returning data to the UI.

#### Scenario: Parsing RPC response
- **WHEN** the Hono RPC client returns a typed payload
- **THEN** the adapter must pass the payload through the relevant Zod DTO schema (e.g., using `parseOrFail()`) to map to Domain Entities and Branded Types
