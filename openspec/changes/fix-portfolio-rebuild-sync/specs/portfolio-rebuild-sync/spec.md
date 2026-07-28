## ADDED Requirements

### Requirement: Explicit Rebuild Synchronization
The backend SHALL synchronize the analytical database (DuckDB) with the transactional ledger (SQLite) when the `POST /api/portfolio/rebuild` endpoint is invoked.

#### Scenario: User requests portfolio synchronization
- **WHEN** the user invokes the `/api/portfolio/rebuild` endpoint
- **THEN** the system triggers `FifoMaterializerService` to rebuild metrics and tax lots
- **AND THEN** the system resets the `needs_recalculation` flag to `false`
- **AND THEN** the system returns a success response to the client
