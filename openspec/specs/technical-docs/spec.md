## MODIFIED Requirements

### Requirement: Root README Updates
The project's root `README.md` and `README.es.md` SHALL be updated to reference the new `api-gateway` package, the `docs/` documentation structure, and the exact steps to spin up the local BFF mock environment.

#### Scenario: Discoverability
- **WHEN** a developer reads the root README files
- **THEN** they find clear references to the new BFF package, the location of the technical documentation, and the instructions to run the BFF and frontend simultaneously to test the mocks.

### Requirement: Technical Documentation Scaffold
The project SHALL have a `docs/` structure, and it SHALL include detailed technical documentation regarding the BFF architecture, Hono API routes, payload contracts, and referential integrity mechanisms used for mocking.

#### Scenario: Documentation verification
- **WHEN** a developer looks into the `docs/` folder
- **THEN** they find dedicated, comprehensive documentation for the Architecture and API, explaining how the `api-gateway` serves the mock data and maintains consistency.
