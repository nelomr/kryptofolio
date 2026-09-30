# ai-model-routing Specification

## Purpose
TBD - created by archiving change add-ai-portfolio-advisor. Update Purpose after archive.
## Requirements
### Requirement: User-Configurable Ordered Model Chain
The ordered fallback chain SHALL live in the `user_settings` key `ai_advisor_model_chain` as a JSON array of chain entries, validated by `modelChainSchema`. It SHALL NOT live in a TypeScript constant, a config file, or an environment variable. `AI_PROVIDER_IDS` SHALL be a single closed tuple in `packages/shared-types`, holding the Phase 0 set `openai`, `anthropic`, `google`, `opencode`, `ollama`, `ollama-cloud` (local daemon vs. direct Ollama Cloud API are distinct provider ids), and the same ids SHALL be the `ai-model` entries of the vault registry. `modelId` SHALL remain an unconstrained non-empty string, because provider model catalogues change without our release cycle.

Each chain entry SHALL additionally carry a required, non-empty positive integer `contextWindow` when, and only when, `providerId` is `ollama` and `modelId` does not end `:cloud` or `-cloud`; every other entry shape SHALL NOT carry a `contextWindow` field. This is a content-discriminated union (design D16), not an optional field on every entry.

#### Scenario: A local entry requires contextWindow
- **WHEN** a chain entry has `providerId: 'ollama'` and a `modelId` ending neither `:cloud` nor `-cloud`, with no `contextWindow`
- **THEN** `modelChainSchema` rejects it

#### Scenario: A metered entry rejects contextWindow
- **WHEN** a chain entry for any provider other than an `ollama` model with a non-cloud-suffixed id carries a `contextWindow` field
- **THEN** `modelChainSchema` rejects it, because that field belongs only to the local shape

#### Scenario: Chain is reordered without a rebuild
- **WHEN** a user submits a reordered chain to the advisor config route
- **THEN** the new order is persisted to `ai_advisor_model_chain` and the next run resolves providers in that order, with no restart or rebuild

#### Scenario: Unknown provider id is rejected at the boundary
- **WHEN** a chain containing a `providerId` outside `AI_PROVIDER_IDS` is submitted
- **THEN** validation fails and the value never reaches the adapter

#### Scenario: Provider vocabulary and vault registry cannot diverge
- **WHEN** `AI_PROVIDER_IDS` is compared with the registry entries whose `category.kind` is `ai-model`
- **THEN** the two sets are equal, so no provider can be selectable in a chain yet unable to hold a credential

#### Scenario: A new model needs no code change
- **WHEN** a provider releases a model id not present when this change shipped
- **THEN** it is accepted by `modelChainSchema` as a non-empty string and requires no release

#### Scenario: Empty chain submission is rejected
- **WHEN** an empty array is submitted as the model chain
- **THEN** `modelChainSchema` rejects it as non-empty is required

#### Scenario: Chain is resolved per request
- **WHEN** two consecutive runs occur with the setting changed in between
- **THEN** the second run uses the updated chain, because resolution happens per request inside the adapter

### Requirement: Keys Are Always Passed Explicitly From The Vault
API keys SHALL be decrypted per request through `IVaultCredentialsPort` and `ICryptographyPort` and passed explicitly as `{ id, apiKey }` to the model router. Provider environment-variable auto-detection SHALL never be relied upon, and no plaintext provider key SHALL exist in `.env`.

#### Scenario: Key is decrypted per run
- **WHEN** a run resolves a cloud provider entry
- **THEN** the key is read via `IVaultCredentialsPort.getCredential(providerId)`, decrypted via `ICryptographyPort`, and passed explicitly in the provider options

#### Scenario: Environment key is not silently used
- **WHEN** a provider's conventional API-key environment variable is set but the vault holds no credential for that provider
- **THEN** the entry is filtered out of the chain and the environment value is not used

### Requirement: Cloud-Suffixed Ollama Models Are Served By The Local Daemon
An `ollama` entry whose `modelId` ends `:cloud` or `-cloud` SHALL be served by the local Ollama daemon exactly like a local entry (`createOllama({ baseURL })`), never through a model-router id, because the router's provider registry has no plain `ollama` provider. It SHALL be classified `metered`, SHALL require no vault credential, and SHALL NOT carry `providerOptions.ollama.options.num_ctx`. An `ollama-cloud` entry SHALL keep using the router with its vault API key.

#### Scenario: A cloud-suffixed ollama entry is built through the daemon
- **WHEN** the resolved chain contains `{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }`
- **THEN** the model-chain configuration holds a `createOllama({ baseURL })` model instance for it, with no router id, no `apiKey`, and no `num_ctx`

#### Scenario: A legacy stored entry with a contextWindow still resolves
- **WHEN** the stored chain holds an `ollama` entry with a cloud-suffixed `modelId` and a `contextWindow`
- **THEN** reading the chain discards that `contextWindow` and keeps the entry as a metered daemon entry

#### Scenario: A stored chain that no longer validates degrades to no model
- **WHEN** the stored chain cannot be parsed or fails `modelChainSchema` after normalization
- **THEN** it is treated as no usable chain and the run fails with `NO_MODEL_AVAILABLE` instead of throwing

### Requirement: Unusable Chain Entries Are Filtered Before The Router Sees Them
An entry whose credential is absent, or whose vault is locked, SHALL be removed from the resolved chain before the model router is invoked. Entries for providers requiring no key (Ollama) SHALL never be filtered on credential grounds.

#### Scenario: Absent credential is filtered
- **WHEN** the chain is `[cloudA, cloudB]` and only `cloudB` has a stored credential
- **THEN** the router receives a chain containing only `cloudB`, and no request is ever sent to `cloudA`

#### Scenario: Locked vault filters keyed entries
- **WHEN** the vault is locked and the chain contains only keyed cloud providers
- **THEN** every entry is filtered out and no model call is made

#### Scenario: Ollama survives filtering
- **WHEN** the chain contains an Ollama entry and the vault holds no credential for it
- **THEN** the Ollama entry remains in the resolved chain

#### Scenario: An empty apiKey is never handed to the router
- **WHEN** a credential lookup yields no usable key
- **THEN** no chain entry with an empty or placeholder `apiKey` is passed to the router, so no non-retryable 401 can abort the chain instead of degrading it

### Requirement: Native Retry And Fallback, Not A Hand-Written Loop
The chain SHALL be executed via the model router's native fallback array with per-entry `maxRetries`, which retries on 5xx, 429, and timeout and advances to the next entry when retries are exhausted. No bespoke retry loop or per-provider agent duplication SHALL be introduced.

#### Scenario: Retryable failure advances the chain
- **WHEN** the first chain entry returns 429 until its `maxRetries` is exhausted
- **THEN** the run continues with the second entry and, on success, terminates with the domain event `completed`, whose receipt names the second entry's provider and model

#### Scenario: No per-provider agent duplication
- **WHEN** the agent definitions are enumerated
- **THEN** the model chain and its dynamic resolver are configured once, on `advisor`, and no agent is duplicated per model provider (the supervisor/sub-agent topology in the `ai-advisor-agent` capability is an orthogonal, phased concern)

### Requirement: An Empty Resolved Chain Calls No Model
When the resolved chain is empty, the run SHALL terminate immediately with `failed` and the code `NO_MODEL_AVAILABLE`, or `VAULT_LOCKED` when a locked vault is the reason. No default provider SHALL work without a configured key.

#### Scenario: No providers configured
- **WHEN** `ai_advisor_model_chain` is unset or every entry was filtered out for an absent credential
- **THEN** the run terminates with `failed` / `NO_MODEL_AVAILABLE`, no outbound provider request is made, and the chat surface renders a call to action pointing at credential settings

#### Scenario: Locked vault is distinguished
- **WHEN** the chain would be non-empty but the vault is locked
- **THEN** the run terminates with `failed` / `VAULT_LOCKED` rather than `NO_MODEL_AVAILABLE`

### Requirement: Total Provider Failure Never Reports Success
When every resolved chain entry fails, the run SHALL terminate with `failed` and the code `ALL_PROVIDERS_FAILED` and a `cause` holding the closed failure kind (`auth-rejected`, `model-not-found`, `rate-limited`, `provider-unavailable`, `network`, or `unknown`) classified from the provider error's HTTP status first and its error code or class second, plus the `providerId`/`modelId` of the last entry that failed. A run SHALL never terminate with `completed` on an empty or partial answer. Requirements in this capability describe behaviour below the route, so they use the domain event names (`completed`, `refused`, `failed`); the wire name `done` appears only in the chat capability.

#### Scenario: Every provider fails
- **WHEN** all entries exhaust their retries with 5xx responses
- **THEN** the run terminates with `failed` / `ALL_PROVIDERS_FAILED` and the audit row records the last provider error code

#### Scenario: A rejected key is classified
- **WHEN** the last chain entry fails with an HTTP 401
- **THEN** the terminal `failed` event carries cause kind `auth-rejected` naming that entry's provider and model, and nothing from the provider's error text, headers, or request body is placed on the event or logged unsanitized

#### Scenario: An unrecognizable error is unknown
- **WHEN** the last chain entry fails with an error exposing no status and no recognizable code
- **THEN** the cause kind is `unknown`

#### Scenario: Partially streamed tokens are preserved
- **WHEN** the first entry streamed some tokens before failing and all subsequent entries also fail
- **THEN** the already-streamed tokens remain visible with the failure appended, and no `completed` event is emitted

#### Scenario: No success event on an empty answer
- **WHEN** a run produced zero text tokens and no provider succeeded
- **THEN** the terminal event is `failed`, never `completed`

### Requirement: Execution Profile Classification And Settings Storage
`classifyExecutionProfile` SHALL be a pure function from a chain entry to `'local' | 'metered'`, derived and never a user-set field: `local` only for `providerId: 'ollama'` with a `modelId` ending neither `:cloud` nor `-cloud`; `metered` for every other case. Per-profile limits SHALL be stored in the `user_settings` key `ai_advisor_execution_profiles`, validated by `executionProfilesSchema`, with code-supplied defaults when unset and hard ceilings the schema enforces regardless of what is submitted.

#### Scenario: Classification needs no settings lookup
- **WHEN** `classifyExecutionProfile` is called with a chain entry
- **THEN** it returns a result using only the entry's own `providerId` and `modelId`, with no I/O

#### Scenario: Defaults apply when unset
- **WHEN** `ai_advisor_execution_profiles` is unset
- **THEN** the resolved limits are the code defaults (metered: maxSteps 5, lastMessages 20; local: maxSteps 15, lastMessages 50)

### Requirement: Discriminated Credential State
The advisor config response SHALL express per-provider credential state as a `kind`-discriminated union `{ kind: 'present' } | { kind: 'absent' } | { kind: 'locked' }`, never as a boolean flag with an optional detail.

#### Scenario: Config response shape
- **WHEN** a client fetches the advisor config
- **THEN** each provider entry carries a `category` and a credential state object with a `kind` of `present`, `absent`, or `locked`

#### Scenario: No key material is returned
- **WHEN** the advisor config response is inspected
- **THEN** it contains no API key, key prefix, or ciphertext — only the credential state `kind`

