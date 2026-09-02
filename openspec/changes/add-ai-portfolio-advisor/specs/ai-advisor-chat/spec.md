# ai-advisor-chat Specification (delta)

## ADDED Requirements

### Requirement: Shared Zod Schema Is The SSE Contract
The SSE event contract SHALL be carried by `advisorStreamEventSchema` in `packages/shared-types/src/advisor-stream.ts`, a `kind`-discriminated union with the members `token`, `tool-start`, `tool-result`, `tool-error`, `done`, `refused`, and `failed`. Type inference over the RPC client SHALL NOT be treated as the stream contract. Every vocabulary on the wire SHALL be a closed const tuple fed to `z.enum(...)`: `ADVISOR_TOOL_NAMES`, `ADVISOR_FAILURE_CODES`, `ADVISOR_TOOL_ERROR_CODES`, and `AI_PROVIDER_IDS`. No failure SHALL cross the wire as an unconstrained string.

#### Scenario: Round-trip contract test
- **WHEN** each variant of `AdvisorStreamEvent` is serialized and parsed back through `advisorStreamEventSchema`
- **THEN** every variant survives unchanged

#### Scenario: Vocabularies are closed
- **WHEN** a frame names a tool outside `ADVISOR_TOOL_NAMES`, a failure code outside `ADVISOR_FAILURE_CODES`, or a tool-error code outside `ADVISOR_TOOL_ERROR_CODES`
- **THEN** `z.enum` validation rejects it, in either direction

#### Scenario: An unexpected server throw still has a named code
- **WHEN** the server's run-wrapping catch emits `failed` for an error it did not anticipate
- **THEN** the code is `INTERNAL_ERROR` from `ADVISOR_FAILURE_CODES`, not a free-text string

#### Scenario: Server validates every outbound frame
- **WHEN** the route is about to write any frame
- **THEN** it parses the frame through `advisorStreamEventSchema` first, so a malformed frame surfaces as a server-side test failure rather than a client mystery

#### Scenario: Client validates every inbound frame
- **WHEN** the frontend receives a frame
- **THEN** it parses it through the same schema and treats a parse failure as an error state, never as a token

### Requirement: SSE Framing And Keep-Alives
Each event SHALL be written as one SSE frame with `event: <kind>` and `data: <JSON of the event>` via Hono's `streamSSE`. Keep-alives SHALL be SSE comment lines (`: keep-alive`) sent every 15 seconds.

#### Scenario: Frame shape
- **WHEN** a `token` event is emitted
- **THEN** the wire bytes carry `event: token` and a `data:` line whose JSON parses to `{ kind: 'token', text: … }`

#### Scenario: Keep-alive is not an event
- **WHEN** a keep-alive is written during a long model pause
- **THEN** it is a comment line, the client parser produces no event from it, and no token is appended

### Requirement: Exactly One Terminal Frame
Exactly one of `done`, `refused`, or `failed` SHALL be emitted as the last frame of every stream that is not cancelled. The server SHALL wrap the whole run so that even an unexpected throw emits `failed` before closing.

#### Scenario: Successful run
- **WHEN** a run completes normally
- **THEN** the final frame is `done` carrying `runId`, `providerId`, `modelId`, `usage.inputTokens`, `usage.outputTokens`, and `toolsCalled`

#### Scenario: Guardrail tripwire
- **WHEN** the output-processor guardrail trips
- **THEN** the final frame is `refused` carrying `runId`, `reason`, and `processorId`, and no `done` frame is emitted

#### Scenario: Unexpected throw still terminates
- **WHEN** the adapter throws an unanticipated error mid-run
- **THEN** a `failed` frame with a named `AdvisorFailureCode` is written before the stream closes

#### Scenario: Never two terminal frames
- **WHEN** any run's full frame sequence is captured
- **THEN** exactly one frame has a kind in `{done, refused, failed}` and it is the last frame

#### Scenario: Tool error is not terminal
- **WHEN** one tool call fails and the model recovers
- **THEN** a `tool-error` frame carrying `callId`, `tool`, and `code` is emitted, the run continues, and it may still terminate with `done`

### Requirement: A Close Without A Terminal Frame Is A Transport Failure
`transport-lost` SHALL NOT exist in the wire schema. When iteration of the port's `AsyncIterable` ends with no terminal event observed, the composable SHALL synthesize a local `{ kind: 'transport-lost' }` state itself.

#### Scenario: Truncated stream
- **WHEN** the connection closes after some `token` frames and before any terminal frame
- **THEN** the frontend enters `transport-lost`, does not report success, and offers an explicit retry

#### Scenario: transport-lost is unrepresentable on the wire
- **WHEN** `advisorStreamEventSchema` is inspected
- **THEN** it declares no `transport-lost` member, so a server can never claim that state

### Requirement: Cancellation Is Client-Initiated And Silent
The composable SHALL hold the `AbortController` and pass its signal into `IAdvisorPort.ask`; calling `abort()` aborts the adapter's `fetch`, fires Hono's `stream.onAbort`, and tears down the model call. No terminal frame SHALL be sent for a cancelled run. The frontend port takes an `AbortSignal` even though the backend port deliberately does not, because the UI holds the controller and has no generator `finally` to hook cleanup onto.

#### Scenario: User cancels mid-stream
- **WHEN** the user stops a run in progress
- **THEN** the fetch aborts, the model call is torn down, no terminal frame is written, and the run is recorded with outcome `aborted`

#### Scenario: Nothing auto-retries
- **WHEN** a run is cancelled or fails
- **THEN** no automatic reconnection or re-run occurs; retry is always an explicit user action

### Requirement: The Stream Transport Lives In The Adapter, Behind A Frontend Port
The frontend SHALL declare `IAdvisorPort` in its domain layer, exposing the run as `ask(request, signal): AsyncIterable<AdvisorStreamEvent>` alongside the non-streaming config methods, exactly as `IMarketDataPort.subscribeToStream` already declares streaming for prices. `RestAdvisorAdapter` SHALL own the `fetch` POST, the `ReadableStream` reader, the SSE frame parser, and schema validation. The composable SHALL contain no `fetch`, no frame parsing, and no knowledge of SSE.

#### Scenario: Transport is not in the UI layer
- **WHEN** the chat composable is inspected
- **THEN** it contains no `fetch`, no `ReadableStream` reader, no SSE frame parsing, and no `EventSource` — it consumes the port's `AsyncIterable` and holds reactive state

#### Scenario: Adapter owns parsing and validation
- **WHEN** `RestAdvisorAdapter` is inspected
- **THEN** it performs the POST, reads the `ReadableStream`, parses SSE frames, ignores comment lines, and validates each frame through `advisorStreamEventSchema`

#### Scenario: A malformed frame is a controlled error
- **WHEN** an inbound frame fails schema validation
- **THEN** the adapter reports it to the `errorBus`, as every other `Rest*Adapter` does, and the run surfaces an error state — never a token and never a silent failure

#### Scenario: EventSource is not used
- **WHEN** the adapter implementation is inspected
- **THEN** it uses `fetch` with a POST body and no `EventSource`, so a completed LLM call can never be silently re-run by automatic reconnection

### Requirement: Token Stream Is Not Pinia Colada, Config Is
Pinia Colada SHALL NOT wrap the token stream; it remains the tool for the advisor's non-streaming server state.

#### Scenario: Stream is not cached as a request/response pair
- **WHEN** the composable consumes a run
- **THEN** no Pinia Colada query wraps the token stream, and tokens are appended incrementally to local reactive state

#### Scenario: Metadata still uses Pinia Colada
- **WHEN** the chat panel loads the advisor config and credential states
- **THEN** that non-streaming data is fetched through a Pinia Colada query in `composables/queries/`, via the same port

### Requirement: Global Chat Panel On Design Tokens
The chat panel SHALL be a global surface styled exclusively with the color tokens and classes defined in `DESIGN.md`. No Tailwind class or token outside `DESIGN.md` SHALL be introduced.

#### Scenario: Tokens only
- **WHEN** the panel's classes are inspected
- **THEN** every color and surface class resolves to a token defined in `DESIGN.md`

#### Scenario: Panel is reachable from any view
- **WHEN** the user is on any view of the application
- **THEN** the chat panel can be opened without navigating away, and per-view embedded insights are absent in this phase

### Requirement: Explicit Empty, Error, And Aborted States
The chat SHALL render a distinct state for each of: empty conversation, streaming in progress, `refused`, `failed` with a code, `transport-lost`, and user-aborted.

#### Scenario: Empty conversation
- **WHEN** the panel opens with no messages in the thread
- **THEN** it renders an empty state prompting the first question, with no error or spinner shown

#### Scenario: No model configured
- **WHEN** a `failed` frame with code `NO_MODEL_AVAILABLE` arrives
- **THEN** the panel renders a call to action linking to credential settings rather than a generic error

#### Scenario: Refusal is distinguished from failure
- **WHEN** a `refused` frame arrives
- **THEN** the panel presents the run as completed-but-withheld with the reason, visually distinct from the `failed` presentation

#### Scenario: Aborted run is presented as aborted
- **WHEN** the user cancels a run
- **THEN** the partial answer stays visible marked as stopped by the user, and no error state is shown

#### Scenario: A follow-up continues the same thread
- **WHEN** the user sends a second message in an open conversation
- **THEN** the request carries the `threadId` reported by the previous run's terminal event, so the model sees the earlier turns

#### Scenario: Starting a new conversation clears the thread
- **WHEN** the user starts a new conversation from the panel
- **THEN** the next request omits `threadId`, a new thread is created server-side, and the panel shows an empty state

#### Scenario: Tool activity is visible
- **WHEN** `tool-start` and `tool-result` frames arrive for a `callId`
- **THEN** the panel shows that tool as running and then as finished, keyed by `callId`
