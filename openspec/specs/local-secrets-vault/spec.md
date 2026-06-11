# local-secrets-vault Specification

## Purpose
TBD - created by archiving change local-secrets-vault. Update Purpose after archive.
## Requirements
### Requirement: Encrypt and store API keys
The system SHALL securely encrypt and store API keys in the local SQLite database using a cryptographically random, per-installation salt for KDF derivation.

#### Scenario: Successful key storage
- **WHEN** user submits an API key through the vault interface
- **THEN** the system encrypts the key with AES-256-GCM and stores the ciphertext, initialization vector, and authentication tag in `kryptofolio.db`

#### Scenario: Salt generation on first use
- **WHEN** the vault is initialized for the first time on a new installation
- **THEN** a random 16-byte salt SHALL be generated via `crypto.randomBytes(16)` and persisted in the `vault_metadata` table

#### Scenario: Salt retrieval on subsequent use
- **WHEN** the vault is initialized on a system that already has a persisted salt
- **THEN** the adapter SHALL read the salt from `vault_metadata` and use it for `scrypt` key derivation

### Requirement: Graceful fallback for Master Key derivation
The system SHALL attempt to use the OS keychain natively, falling back to a password prompt or environment variable if the keychain is unavailable.

#### Scenario: Native Desktop
- **WHEN** running in an environment with OS keychain support (Tauri/Electron)
- **THEN** the master key is automatically derived/retrieved and the vault unlocks seamlessly

#### Scenario: Docker Web UI
- **WHEN** running in an isolated Docker container without `KRYPTO_MASTER_KEY`
- **THEN** the vault stays locked and requires the user to input a master password to unlock the key in-memory

### Requirement: Secure memory scrubbing
The system SHALL clear ALL plaintext buffers from memory immediately after encryption, decryption, or network transmission. Both the encrypt and decrypt paths MUST scrub their respective buffers.

#### Scenario: Memory cleanup after encryption
- **WHEN** an encryption operation concludes
- **THEN** the plaintext `Buffer` containing the API key is zeroed out using `buffer.fill(0)` inside the cryptography adapter

#### Scenario: Memory cleanup after decryption
- **WHEN** a decryption operation returns a plaintext buffer to a Use Case consumer
- **THEN** the consumer SHALL call `decryptedBuffer.fill(0)` after converting the buffer to its target type (e.g., string for JSON parsing)

### Requirement: Log redaction
The system SHALL NOT leak plaintext credentials in the application logs.

#### Scenario: Automatic redaction
- **WHEN** a request containing an `apiKey` or `authorization` header is logged
- **THEN** the value is censored with `[CONFIDENTIAL_KRYPTOFOLIO]` in the standard output

### Requirement: Strict Hexagonal Isolation
The local secrets vault SHALL adhere to strict Hexagonal Architecture. The HTTP delivery layer (router) MUST NOT import or instantiate infrastructure adapters or execute database queries directly. All requests MUST be routed through Application Use Cases.

#### Scenario: Architecture Boundary Enforcement
- **WHEN** a request is made to the credentials API
- **THEN** the router delegates execution to a Use Case (e.g., `UnlockVaultUseCase`), which in turn interfaces with Domain Ports (`ICredentialsRepository`, `ICryptographyPort`), avoiding any direct coupling to SQLite or `node:crypto`.

### Requirement: Deterministic Database Bootstrap
The database connection MUST NOT use an Immediately Invoked Function Expression (IIFE) at the module level. Initialization and table creation MUST be an explicit asynchronous process that halts server startup upon failure.

#### Scenario: Failing Initialization
- **WHEN** the `initializeDatabase()` method encounters a fatal SQL error
- **THEN** the application throws an exception and halts, preventing the server from accepting requests in a corrupted state.

### Requirement: Development Mock Isolation
The database infrastructure MUST isolate test and development data when executing in mock mode.

#### Scenario: Mock Mode Execution
- **WHEN** the application starts with `MOCK_MODE=true`
- **THEN** the database adapter forces libSQL to use a transient in-memory database (`:memory:`) to ensure no artifact remains on the filesystem after termination.

### Requirement: Database Abstraction
The system SHALL abstract database interactions for system credentials behind an `ICredentialsRepository` port. The repository MUST support storing and retrieving JSON-serialized objects as encrypted buffers, in addition to simple strings.

#### Scenario: Fetching Configured Services
- **WHEN** the `GetVaultStatusUseCase` needs to verify which services are configured
- **THEN** it calls `ICredentialsRepository.getConfiguredServices()` instead of executing a raw SQL query.

#### Scenario: Saving Complex Credentials
- **WHEN** the `StoreServiceCredentialUseCase` receives a payload object containing multiple keys (e.g., `{ apiKey: "...", apiSecret: "..." }`)
- **THEN** the payload is serialized to a JSON string, converted to a Buffer, encrypted via `ICryptographyPort`, and passed to the repository for storage.

### Requirement: Cryptography Abstraction
The system SHALL abstract cryptographic operations behind an `ICryptographyPort`. The API layer MUST NOT contain hardcoded algorithms, salts, or direct `node:crypto` imports.

#### Scenario: Deriving the Master Key
- **WHEN** the vault is unlocked
- **THEN** the `UnlockVaultUseCase` delegates the key derivation and initialization to the `ICryptographyPort`, passing only the raw password.

### Requirement: Open/Closed API Status Response
The vault status endpoint SHALL return a dynamic list of configured services rather than hardcoded boolean properties for each service.

#### Scenario: Checking Vault Status
- **WHEN** a client requests `GET /api/credentials/vault/status`
- **THEN** the API returns `{ isUnlocked: boolean, configuredServices: string[] }` instead of hardcoded keys like `KRAKEN_API_CONFIGURED`.

### Requirement: Strict type safety in Application layer
All Use Case return types SHALL be explicitly typed. The `any` type SHALL NOT appear in any production code within the `core/application/` layer.

#### Scenario: GetServiceCredentialUseCase return type
- **WHEN** `GetServiceCredentialUseCase.execute()` is inspected
- **THEN** its return type SHALL be `Promise<Record<string, string> | null>`, NOT `Promise<any>`

#### Scenario: Use Case port encapsulation
- **WHEN** a Use Case class is inspected
- **THEN** injected ports SHALL be `private readonly`, not `public readonly`

### Requirement: Port naming convention
All domain port interfaces SHALL follow the project's Port/Adapter nomenclature. Interface names MUST use the "Port" suffix (e.g., `IVaultCredentialsPort`), NOT "Repository".

#### Scenario: Credentials port naming
- **WHEN** the vault credentials port interface is inspected
- **THEN** it SHALL be named `IVaultCredentialsPort` in `domain/ports/IVaultCredentialsPort.ts`, NOT `ICredentialsRepository`

#### Scenario: Adapter naming consistency
- **WHEN** an infrastructure adapter implementing a port is inspected
- **THEN** it SHALL use the "Adapter" suffix (e.g., `SqliteVaultRepositoryAdapter`)

### Requirement: Service parameter validation
The `POST /vault/:service` endpoint SHALL validate the `:service` URL parameter against the known provider registry before processing the request.

#### Scenario: Valid service identifier
- **WHEN** a POST request is made to `/vault/KRAKEN_API` and `KRAKEN_API` is a registered provider
- **THEN** the request is processed normally

#### Scenario: Invalid service identifier
- **WHEN** a POST request is made to `/vault/UNKNOWN_SERVICE` and `UNKNOWN_SERVICE` is not a registered provider
- **THEN** the endpoint SHALL return HTTP 400 with `{ success: false, error: "Unknown provider" }`

### Requirement: Structured logging throughout
The API Gateway entry point SHALL use the structured `bffLogger` (Pino) for all log output instead of raw `console.*` methods, to ensure redaction rules apply globally.

#### Scenario: Bootstrap logging
- **WHEN** the server starts successfully or fails to start
- **THEN** log messages SHALL be emitted via `bffLogger.info()` or `bffLogger.fatal()`, NOT via `console.log/error`

#### Scenario: Proxy error logging
- **WHEN** a proxy request fails
- **THEN** the error SHALL be logged via `bffLogger.error()` with the error object attached

### Requirement: Full i18n coverage in vault UI
All user-visible strings in the vault settings UI SHALL use `t()` translation calls. No hardcoded strings SHALL appear in the template.

#### Scenario: Status badges
- **WHEN** a provider card renders its configuration status badge
- **THEN** it SHALL use `t('vault.provider.status.configured')` and `t('vault.provider.status.not_configured')` instead of hardcoded English strings

#### Scenario: Action buttons
- **WHEN** the save button renders its label
- **THEN** it SHALL use `t('vault.actions.save')` instead of the hardcoded string "Save"

### Requirement: No `any` type in frontend production code
All TypeScript files in the frontend SHALL use `unknown` instead of `any` for error handling and untyped data, with explicit type narrowing.

#### Scenario: Error handling in composables
- **WHEN** a catch block captures an error
- **THEN** the variable SHALL be typed as `unknown` and narrowed via `error instanceof Error` before accessing `.message`

#### Scenario: BFF error parsing
- **WHEN** `parseBffError` receives error response data
- **THEN** its parameter SHALL be typed as `unknown` and narrowed with `typeof` guards

### Requirement: Test lifecycle correctness
All test suites SHALL properly register lifecycle hooks. Imported lifecycle functions SHALL be called, not left as dangling expressions.

#### Scenario: afterEach cleanup
- **WHEN** `afterEach` is imported in a test file
- **THEN** it SHALL be invoked as `afterEach(() => { ... })`, not declared as a standalone arrow function

