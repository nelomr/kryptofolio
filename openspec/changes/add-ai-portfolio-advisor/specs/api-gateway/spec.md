# api-gateway Specification (delta)

## ADDED Requirements

### Requirement: Advisor Routes Are First-Class Typed Hono Routes
The gateway SHALL expose the advisor as hand-written Hono routes registered in `app.ts`'s fluent `.route()` chain, so they participate in `AppType` inference. No generic agent handler and no framework-provided agent router (`@mastra/hono` or equivalent) SHALL be mounted.

#### Scenario: Routes participate in AppType
- **WHEN** the frontend uses `hc<AppType>` against the advisor config route
- **THEN** the path and request body are typed end to end with no hand-maintained duplicate contract

#### Scenario: No generic agent endpoint
- **WHEN** the registered routes are enumerated
- **THEN** no catch-all agent endpoint exists, and no route delegates to a third-party agent HTTP handler

#### Scenario: Registration order preserves inference
- **WHEN** the advisor routes are added to the fluent chain in `app.ts`
- **THEN** `pnpm typecheck` passes and `AppType` still resolves every pre-existing route

### Requirement: Advisor Route Surface
The gateway SHALL expose exactly three advisor concerns: a non-streaming ask route, an SSE streaming route, and a model/provider configuration route (read and write). Both ask routes SHALL delegate to the same `AskAdvisorUC`, so no second orchestration path exists that could drift from the first.

#### Scenario: Streaming route content type
- **WHEN** a client POSTs a valid body to the advisor stream route
- **THEN** the response has content type `text/event-stream` and frames arrive incrementally rather than as one buffered body

#### Scenario: Inbound body is validated
- **WHEN** a request body fails `askAdvisorRequestSchema` — an empty `message`, a `message` longer than 4000 characters, or a non-UUID `threadId`
- **THEN** `zValidator('json', …)` rejects it with a validation error and no run is started

#### Scenario: Config route round-trip
- **WHEN** a client writes a model chain and then reads the advisor config
- **THEN** the response returns the persisted chain plus a per-provider discriminated credential state

### Requirement: The Non-Streaming Ask Route Folds The Same Event Stream
The non-streaming ask route SHALL drain `IAdvisorPort.ask` to its terminal event and return `advisorAnswerSchema`-validated JSON of the form `{ text, outcome, receipt }`, where `outcome` carries the same `completed | refused | failed` discriminant as the terminal event and `text` is the concatenation of the run's `token` events. It SHALL introduce no orchestration of its own and SHALL have no cancellation semantics.

#### Scenario: Successful run folds to text plus receipt
- **WHEN** a client posts a valid body to the non-streaming ask route and the run completes
- **THEN** the response is `{ outcome: 'completed', text, receipt }` where `text` equals the concatenation of the token events a streaming run of the same request would have emitted

#### Scenario: Refusal returns no answer text
- **WHEN** the guardrail trips during a non-streaming run
- **THEN** the response carries `outcome: 'refused'` with the reason and processor id, and no answer text

#### Scenario: Failure returns a named code
- **WHEN** the resolved model chain is empty
- **THEN** the response carries `outcome: 'failed'` with code `NO_MODEL_AVAILABLE`, and no answer text

#### Scenario: Both routes share one use case
- **WHEN** the two ask routes are inspected
- **THEN** each calls `AskAdvisorUC` and the only difference is that one forwards events through `toWireEvent` while the other folds them

#### Scenario: A client hanging up still leaves an audit row
- **WHEN** the client disconnects before the non-streaming route responds
- **THEN** the same `finally` that serves the streaming route writes an `ai_advisor_runs` row with `outcome = 'aborted'`

### Requirement: Advisor Routes Contain No Business Logic
Each advisor route SHALL validate its input, delegate to `AskAdvisorUC` or the corresponding configuration use case, map domain events to wire DTOs through the single `toWireEvent` mapping in `infrastructure/dtos/advisor.ts`, and return DTOs.

#### Scenario: Route delegates only
- **WHEN** an advisor route handler is inspected
- **THEN** it contains no model call, no tool invocation, no prompt construction, and no figure computation

#### Scenario: Single mapping site
- **WHEN** the repository is searched for conversions from `AdvisorEvent` to `AdvisorStreamEvent`
- **THEN** the only such conversion is `toWireEvent` in `infrastructure/dtos/advisor.ts`

#### Scenario: Client disconnect propagates
- **WHEN** the client aborts the streaming request
- **THEN** the route's `stream.onAbort` handler stops iterating the port's `AsyncIterable`, releasing the underlying model call
