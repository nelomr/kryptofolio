# Tasks — add-ai-portfolio-advisor (Phase 0)

Every command in this checklist runs with an explicit Node 24 prefix, because the shell default is
v20.20.0 while root `engines.node` requires `>=24.16.0` — including `git commit`, whose Husky hook
runs under whatever node is first on `PATH`:

```
export N24='PATH=/Users/nelo/.nvm/versions/node/v24.16.0/bin:$PATH'
```

Frontend typecheck is always `vue-tsc --build --force` (`pnpm --filter @kryptofolio/frontend typecheck`).
A bare `--noEmit` on this solution-style `tsconfig.json` silently checks zero files.

TDD is strict throughout: every `write the failing test` task ends with the test *run* and observed
red **for the stated reason**, and every `prove it can fail` task applies a deliberate break to the
production line the target case actually reaches, confirms the *named* assertion goes red, then
restores. A green suite never watched go red is not evidence.

Vocabulary, fixed by design D2 and used consistently below: everything from the route inwards speaks
the **domain** names `completed | refused | failed`; only the SSE contract and the frontend speak the
**wire** names `done | refused | failed`.

## 1. Baseline, dependencies, and re-verification of D6

- [ ] 1.1 Record the pre-change baseline: run `$N24 pnpm typecheck` and `$N24 pnpm test` at the root and write down which packages are green, so "still green" has a meaning later.
- [ ] 1.2 Install `@mastra/core`, `@mastra/libsql`, and `ollama-ai-provider-v2` into `apps/backend` only (no new workspace package), then **immediately** run `$N24 pnpm typecheck` across the whole repo before writing any other line of code.
- [ ] 1.3 Resolve the zod identity question against reality: inspect the installed tree for which zod versions are present (catalog pins `^3.25.76`; `zod@4.4.3` already resolves transitively) and which one `@mastra/core`'s `createTool` types are compiled against. Record the finding in `design.md` D6.
- [ ] 1.4 Write a throwaway spike file that calls `createTool` with a Zod `inputSchema` and `outputSchema` from the entrypoint the AI subtree will use, and typecheck it. If a `ZodObject is not assignable` mismatch appears, align the workspace catalog's zod version (and re-run 1.2's typecheck). **Never cast, never `as any`, never `as never`** — a cast here is the exact failure D6 predicts. Delete the spike once the entrypoint choice is settled.
- [ ] 1.5 Re-verify D6's remaining type claims against the installed `.d.ts` files, not the published docs: `Processor`'s generic defaults and `abort` signature, `Agent.stream`'s return type, the `ChunkType` union's discriminant and member names for `text-delta`, `tool-call`, `tool-result`, `tool-error`, `tripwire`, `error`, `abort`, `finish`, and the `Memory` constructor options used in D10. Update D6/D10 in `design.md` in this same session if anything diverges.
- [ ] 1.6 Add a changeset for the change and confirm `$N24 pnpm typecheck` is still green before moving on.

## 2. Vault registry widening (gates model-chain resolution)

- [ ] 2.1 Write the failing test for the widened registry: assert every entry returned by `GetAvailableProvidersUseCase` carries a discriminated `category` of `{ kind: 'exchange' } | { kind: 'market-data' } | { kind: 'ai-model' }`. Run it, confirm red.
- [ ] 2.2 Widen the `VaultProvider` domain model (`core/domain/models/VaultProvider.ts`, today `{ id, name, fields }`) with the discriminated `category` field — non-optional, so a missing category is a compile-time error, not a runtime default. No boolean flags.
- [ ] 2.3 Add `category` to every existing hardcoded entry in `GetAvailableProvidersUseCase`, and fix every call site the compiler flags — change the call sites, do not add a shim (rule 8).
- [ ] 2.4 Write the failing test for AI-provider registration: the registry contains exactly the five Phase 0 AI providers (`openai`, `anthropic`, `google`, `opencode`, `ollama`), `POST /api/credentials/vault/:service` accepts an AI provider id through the existing encrypted path with no migration, and still rejects an unregistered AI id with `UNKNOWN_PROVIDER`. Run it, confirm red, then implement.
- [ ] 2.5 Write the failing test for isolated enumeration: filtering the registry on `category.kind === 'ai-model'` matches no exchange or market-data provider. Run it, confirm red, then implement.
- [ ] 2.6 Prove it can fail: break the category assignment on one existing provider entry, confirm 2.1's specific assertion goes red for that entry, restore.
- [ ] 2.7 Update the credentials settings view to group providers by `category.kind` with AI providers in their own group, using only `DESIGN.md` tokens.
- [ ] 2.8 Typecheck and test both touched packages: `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`, and `$N24 pnpm --filter @kryptofolio/frontend typecheck` (`vue-tsc --build --force`) `&& ... test`.

## 3. Audit-trail migration (`007_ai_advisor_runs`)

- [ ] 3.1 Write the failing integration test `packages/database/tests/integration/migration_007_ai_advisor_runs.spec.ts`, mirroring the existing `migration_006_fx_conversion_provenance.spec.ts` shape: applying 007 to a database already at 006 creates `ai_advisor_runs`, and the table is `STRICT`. Run it, confirm red.
- [ ] 3.2 Extend that test with the assertions the spec requires: the `outcome` CHECK admits exactly `completed|refused|failed|aborted` and rejects anything else; `tools_called` defaults to `'[]'`; and the table declares **no** column holding prompt, message, or completion text.
- [ ] 3.3 Add a test asserting 007 is additive-only: no existing table's definition and no existing `CHECK` constraint changes (a `CHECK` cannot be `ALTER`ed, only rebuilt, and the runner is forward-only with no down migrations).
- [ ] 3.4 Add a test asserting the write is idempotent per run: writing the same `id` twice leaves exactly one row, which is what lets the terminal-event path and the cancellation path (11.x) coexist without double-writing.
- [ ] 3.5 Write `packages/database/migrations/sqlite/007_ai_advisor_runs.sql` exactly as specified in design D4 — a brand-new STRICT table, nothing else. Run the tests, confirm green.
- [ ] 3.6 Prove it can fail: remove one value from the `outcome` CHECK list, confirm the CHECK-rejection assertion (not a neighbouring one) goes red, restore.
- [ ] 3.7 `$N24 pnpm --filter @kryptofolio/database typecheck && ... test`.

## 4. Shared wire contract and vocabularies — gates route, adapter and frontend

- [ ] 4.1 Write the failing round-trip contract test in `packages/shared-types`: every variant of `AdvisorStreamEvent` (`token`, `tool-start`, `tool-result`, `tool-error`, `done`, `refused`, `failed`) survives serialize → `advisorStreamEventSchema.parse` unchanged. Run it, confirm red.
- [ ] 4.2 Extend the test with the closed-vocabulary assertions: a frame naming a tool outside `ADVISOR_TOOL_NAMES`, a failure code outside `ADVISOR_FAILURE_CODES`, or a tool-error code outside `ADVISOR_TOOL_ERROR_CODES` is rejected; and the schema declares **no** `transport-lost` member (it must be unrepresentable on the wire).
- [ ] 4.3 Add the four const tuples fed to `z.enum(...)` in the `z.enum(FIFO_QUALITY_FLAGS)` style already used in `schemas/fifo-policy.ts`: `ADVISOR_TOOL_NAMES` (`portfolio_summary`, `fiscal_integrity`, `token_history`), `ADVISOR_FAILURE_CODES` (`NO_MODEL_AVAILABLE`, `VAULT_LOCKED`, `ALL_PROVIDERS_FAILED`, `INTERNAL_ERROR`), `ADVISOR_TOOL_ERROR_CODES` (`INVALID_TOOL_INPUT`, `USE_CASE_FAILED`), and `AI_PROVIDER_IDS` (`openai`, `anthropic`, `google`, `opencode`, `ollama`).
- [ ] 4.4 Implement `advisor-stream.ts` as a `kind`-discriminated union per D1's table — `tool-error.code` is `z.enum(ADVISOR_TOOL_ERROR_CODES)`, never `z.string()` — export `AdvisorStreamEvent` via `z.infer`, and re-export from `packages/shared-types/src/index.ts`. Run 4.1–4.2, confirm green.
- [ ] 4.5 Add `modelChainSchema` (non-empty array of `{ providerId: z.enum(AI_PROVIDER_IDS), modelId: z.string().min(1) }`) with a failing test first: an empty array is rejected, an unknown `providerId` is rejected, and a `modelId` unknown at ship time is **accepted** (model catalogues must not require a release).
- [ ] 4.6 Write the failing test asserting `AI_PROVIDER_IDS` and the registry's `ai-model` entries are the same set, so a provider can never be selectable in a chain yet unable to hold a credential. Run it, confirm red, then reconcile.
- [ ] 4.7 Prove it can fail: change one union member's discriminant literal, confirm that variant's round-trip assertion goes red, restore.
- [ ] 4.8 `$N24 pnpm --filter @kryptofolio/shared-types typecheck && ... test`.

## 5. `core-domain`: monetary comparison and the ranking service (gates the tools)

The AI subtree may not compare money, and the holdings snapshot arrives unordered — so the ranking
lives here, in a pure service, before any tool exists.

- [ ] 5.1 Write the failing test for `Money.compare(other): -1 | 0 | 1`, including a pair whose difference is beyond float precision (so a float implementation would return the wrong sign) and the equality case. Run it, confirm red.
- [ ] 5.2 Implement `compare` on `Money` (`packages/core-domain/src/value-objects/Money.ts`) using the private `Decimal` it already holds. Additive only: no existing method changes.
- [ ] 5.3 Write the failing tests for `rankHoldingsByValue(holdings, valueOf, topN)` in `packages/core-domain/src/domain/services/holdingRanking.ts`: it returns `{ ranked, omittedCount, unvalued }`; `ranked` is descending by exact decimal value and at most `topN`; `omittedCount` counts only *valued* holdings that missed the cut; and a holding whose `valueOf` returns `undefined` lands in `unvalued`, never in `ranked`, and is never compared as `'0'`. Run them, confirm red.
- [ ] 5.4 Write the failing test asserting the service imports no `decimal.js` directly and compares only through `Money`, keeping `core-domain/domain/services/` internal-imports-only as the existing files there already are. Run it, confirm red.
- [ ] 5.5 Implement the service, export both from `packages/core-domain/src/index.ts`, and confirm 5.1–5.4 green.
- [ ] 5.6 Prove it can fail: replace `Money.compare` with a `parseFloat` comparison, confirm the beyond-float-precision assertion in 5.1 goes red (and that it is that assertion, not the equality one), restore.
- [ ] 5.7 Prove it can fail: make `unvalued` holdings sort as `'0'` instead of being separated, confirm 5.3's `unvalued` assertion goes red while the `omittedCount` assertion for the all-valued case stays green, restore.
- [ ] 5.8 `$N24 pnpm --filter @kryptofolio/core-domain typecheck && ... test`.

## 6. Backend domain (ports, events, receipt)

- [ ] 6.1 Write the failing test for `AdvisorEvent`/`AdvisorRunReceipt` shape: each terminal member (`completed`, `refused`, `failed`) carries an `AdvisorRunReceipt` with provider used, model used, ordered tool names, and token counts — no second metadata channel. Run it, confirm red.
- [ ] 6.2 Add `core/domain/models/AdvisorEvent.ts`, `AdvisorRunReceipt.ts` (plus the `AdvisorRunReceiptDraft` the adapter accumulates and the `AdvisorRunOutcome` union including `aborted`), and `AdvisorRequest.ts` — all `kind`-discriminated unions. Monetary fields are `PreciseAmount`; no boolean-plus-optional-payload shapes.
- [ ] 6.3 Add `core/domain/ports/IAdvisorPort.ts` declaring exactly `ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent>`, with the `ILedgerPort.ts`-style domain-isolation header, `import type` only, `.js` extensions, and no `AbortSignal`, no Zod, no `@mastra/*`, no web-stream or HTTP type.
- [ ] 6.4 Add `core/domain/ports/IAdvisorRunLogPort.ts` — `appendRun(receipt, outcome): Promise<void>`, the port through which the use case persists the audit row (rule 2: the use case never touches SQLite directly). Domain-pure, `Promise<…>` methods, no `Result` type.
- [ ] 6.5 Add a static-isolation test asserting `IAdvisorPort.ts`, `IAdvisorRunLogPort.ts`, `AdvisorEvent.ts`, `AdvisorRunReceipt.ts` and `AdvisorRequest.ts` contain no import outside sibling domain modules and no mention of `AbortSignal`. Write it failing first (against a deliberately added import), confirm red, remove the import, confirm green.
- [ ] 6.6 `$N24 pnpm --filter @kryptofolio/backend typecheck`.

## 7. Model-chain resolution (gates the adapter)

- [ ] 7.1 Write the failing test for chain persistence and per-request resolution: the chain is read from and written to the `user_settings` key `ai_advisor_model_chain` via `IUserSettingsPort`, and a change between two consecutive resolutions takes effect on the second without a restart. Run it, confirm red.
- [ ] 7.2 Implement the chain-resolution unit (`infrastructure/ai/models/`), reading the setting and validating it through `modelChainSchema`. No chain in a TS constant, config file, or env var.
- [ ] 7.3 Write the failing tests for credential filtering, one assertion per scenario: an entry whose credential is absent is filtered out and never contacted; a locked vault filters every keyed entry; an Ollama entry survives with no credential; and no entry with an empty or placeholder `apiKey` is ever handed to the router (a 401 is non-retryable and would abort the chain instead of degrading it). Run them, confirm red.
- [ ] 7.4 Implement filtering: decrypt per request via `IVaultCredentialsPort.getCredential(providerId)` + `ICryptographyPort`, pass keys explicitly as `{ id, apiKey }`, and never fall back to provider environment-variable auto-detection.
- [ ] 7.5 Write the failing tests for the empty-chain outcomes: an unset or fully-filtered chain yields `failed` / `NO_MODEL_AVAILABLE` with **no** outbound provider request, and a locked vault yields `failed` / `VAULT_LOCKED` instead. Run them, confirm red, then implement.
- [ ] 7.6 Prove it can fail: remove the locked-vault branch so it collapses into `NO_MODEL_AVAILABLE`, confirm the `VAULT_LOCKED` assertion goes red while the environment-key assertion stays green, restore.
- [ ] 7.7 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 8. Tool budget gate and the three read-only tools

- [ ] 8.1 Write the failing test for `enforceBudget(payload, maxChars)`: an over-budget payload returns `{ kind: 'truncated', … }` naming what was dropped and never the oversized payload; measurement is `JSON.stringify(payload).length` against a constant with no tokenizer invoked. Run it, confirm red, then implement `infrastructure/ai/tools/enforceBudget.ts`.
- [ ] 8.2 Write the failing test asserting the per-tool constants: portfolio summary 4000, fiscal integrity 6000, token history 6000, all in one file. Run it, confirm red, then implement.
- [ ] 8.3 Write the failing tests for the portfolio summary tool against a **worst-case 40-holding shape derived from the real ledger** (working-method rule 5 — a hand-written fixture will always fit), all values resolved: the result carries the top 15 by value, `omittedCount: 25`, `unvaluedCount: 0`, monetary fields are the exact strings from the use case validated by `preciseAmountSchema`, and the only `z.number()` fields are integer counts. Run them, confirm red.
- [ ] 8.4 Write the failing tests for the third state, using the same 40-holding shape with 6 holdings whose `current_value_fiat` is absent or whose `cost_basis` is `UNCONVERTIBLE`: the result carries the top 15 of the 34 valued holdings, `omittedCount: 19`, `unvaluedCount: 6`, the unvalued holdings are listed as unvalued, and **no** absent figure is substituted with `'0'`, `null`, or an empty string. Run them, confirm red.
- [ ] 8.5 Write the failing test asserting the incompleteness signals travel with the figures: with `rates_incomplete: true` / `prices_incomplete: true` from `GetPortfolioSummaryUseCase`, the tool result carries both flags. Run it, confirm red.
- [ ] 8.6 Implement the portfolio summary tool: `createTool` with both a Zod `inputSchema` and a `.strict()` `outputSchema`, injected `GetPortfolioSummaryUseCase` only, one use-case call, then `rankHoldingsByValue` from `core-domain`, then projection, then `enforceBudget`. **No `.sort(`, no comparison operator on a monetary value, no `Number(`, `parseFloat`, `toFixed`, `Intl.NumberFormat`, and no `decimal.js` import.**
- [ ] 8.7 Write the failing tests for the fiscal integrity tool against a report exercising **every** `FIFO_QUALITY_FLAG`: per-flag counts plus at most the top N defect groups ranked by the integer `count` that `FiscalIntegrityGroup` already carries (no monetary comparison needed), and **zero** per-transaction rows. Run them, confirm red, then implement over `GetFiscalIntegrityUseCase`.
- [ ] 8.8 Write the failing tests for the token history tool: a symbol failing the `inputSchema` regex produces a `tool-error` with code `INVALID_TOOL_INPUT` and `GetTokenHistoryUseCase` is **never invoked**; a model-supplied `accountId` is parsed to its branded type at the boundary rather than cast. Run them, confirm red, then implement.
- [ ] 8.9 Write the failing test asserting `.strict()` actually bites: adding a field not declared in a tool's `outputSchema` is rejected rather than emitted as a silently larger payload. Run it, confirm red, then confirm the schemas make it green.
- [ ] 8.10 Write the failing test for the minimal dependency set: each tool factory's constructor parameters contain only the use case it wraps plus pure configuration — no `ILedgerPort`, `ITaxCalculatorPort`, `IDatabasePort`, or DuckDB connection. Run it, confirm red, then implement.
- [ ] 8.11 Write the failing test for the read-only guarantee: the registered tool set is exactly these three, and no tool exists whose `execute` performs an insert, update, or delete. Run it, confirm red, then confirm green.
- [ ] 8.12 Prove it can fail: raise the portfolio top-N from 15 to 20, confirm 8.3's `omittedCount: 25` assertion goes red (and confirm the break landed on a line the 40-holding case actually reaches), restore.
- [ ] 8.13 Prove it can fail: make the tool treat an absent `current_value_fiat` as `'0'` instead of unvalued, confirm 8.4's `unvaluedCount: 6` assertion goes red while 8.3's all-valued assertions stay green, restore.
- [ ] 8.14 Prove it can fail: drop `prices_incomplete` from the projection, confirm 8.5's assertion goes red, restore.
- [ ] 8.15 Prove it can fail: bypass the `enforceBudget` call in one tool, confirm the truncation assertion for that tool goes red, restore.
- [ ] 8.16 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 9. Prompts and the guardrail output processor

- [ ] 9.1 Write the failing test for dynamic instructions: two request contexts differing only in `language` produce instruction strings with a byte-identical stable prefix, differing only in the context-derived section. Run it, confirm red.
- [ ] 9.2 Write the failing test asserting the instruction string produced for any request context contains no asset symbol, quantity, balance, or fiscal figure — volatile portfolio data appears only inside tool results. Run it, confirm red.
- [ ] 9.3 Write the failing test asserting the instructions direct the agent to report a total as partial whenever a tool result carries an incompleteness signal. Run it, confirm red.
- [ ] 9.4 Implement `infrastructure/ai/prompts/` as a single instructions function of request context — **locale and base currency only; no verbosity input exists in this phase** (no setting and no control supplies one). One agent, not N prompts. Confirm 9.1–9.3 green.
- [ ] 9.5 Write the failing tests for the "not financial advice" output processor: tripping produces a `refused` outcome carrying the tripping `processorId` and reason with the withheld answer not delivered; compliant output produces `completed` and emits no `refused`; and an output that complies with a user instruction to ignore the disclaimer still trips, because enforcement is post-generation. Run them, confirm red.
- [ ] 9.6 Implement the processor in `infrastructure/ai/` using Mastra's `Processor` with its `abort(reason, …)` signature as re-verified in 1.5. `unknown`, never `any`.
- [ ] 9.7 Prove it can fail: break the tripwire→`refused` mapping, confirm the `refused`-carrying-`processorId` assertion — **not** a neighbouring assertion — goes red, restore. This is one of the two likeliest vacuous-pass shapes in this change.
- [ ] 9.8 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 10. `MastraAdvisorAdapter` — the single LLM import site

- [ ] 10.1 Write the failing test for chunk mapping: each mapped `ChunkType` kind (`text-delta`, `tool-call`, `tool-result`, `tool-error`, `tripwire`, `error`, `abort`, `finish`) yields the corresponding `AdvisorEvent`, and a terminal event carries a populated `AdvisorRunReceipt`. Run it, confirm red.
- [ ] 10.2 Write the failing test for receipt accumulation: after one completed tool call and some tokens, and **before** any terminal event, the draft already names the provider, the model and that tool — so a run that never terminates still has something to audit. Run it, confirm red.
- [ ] 10.3 Write the failing test asserting a chunk whose `type` the adapter does not map is dropped silently — the run continues and no `failed` event is emitted (a Mastra minor adding a chunk type must not break the build or the run). Run it, confirm red.
- [ ] 10.4 Implement `MastraAdvisorAdapter.ts` as an async generator over `Agent.stream(...).fullStream`, with a deliberately non-exhaustive `switch` and an ignoring `default:`, filling an `AdvisorRunReceiptDraft` as facts arrive and emitting a frozen receipt on the terminal event. Wire the resolved chain from section 7 through Mastra's dynamic `model: ({ requestContext }) => […]` form with per-entry `maxRetries` — its native fallback array, no bespoke retry loop, exactly one agent.
- [ ] 10.5 Add `infrastructure/ai/mastraChunk.ts`: provider-shaped payloads (`tool-call.args`, `tool-result.result`, `raw`) are typed `unknown` and narrowed by a local Zod schema or a narrow locally-declared interface naming only the fields consumed. No cast anywhere.
- [ ] 10.6 Write the failing tests for conversation memory: a follow-up on the same `threadId` sees the prior turns; two different `threadId` values are isolated; a request omitting `threadId` gets a thread created whose id is reported in the terminal event; and the configuration has semantic recall and observational memory **off** with no embedding model or vector store present. Run them, confirm red, then wire Mastra `Memory` with `resource: 'local'` and bounded `lastMessages`.
- [ ] 10.7 Write the failing test for cancellation: a consumer that `break`s out of `for await` (or calls `.return()`) causes the generator's `finally` block to run and the underlying model call to be torn down. Run it, confirm red, then implement the `finally` teardown.
- [ ] 10.8 Write the failing tests for total provider failure: every entry exhausting retries on 5xx yields `failed` / `ALL_PROVIDERS_FAILED`; tokens already streamed by an earlier entry are preserved with the failure appended; and a run with zero text tokens and no successful provider terminates `failed`, never `completed`. Run them, confirm red, then implement.
- [ ] 10.9 Write the failing test asserting `MastraAdvisorAdapter.ts` is the **only** file in the repository importing `@mastra/`. Run it against a deliberately misplaced import, confirm red, remove it, confirm green.
- [ ] 10.10 Prove it can fail: remove the `finally` teardown, confirm 10.7's teardown assertion goes red, restore.
- [ ] 10.11 Prove it can fail: stop populating `providerId` in the draft until the terminal event, confirm 10.2's before-termination assertion goes red while 10.1's terminal-receipt assertion stays green, restore.
- [ ] 10.12 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 11. `AskAdvisorUC` and the run-log adapter

- [ ] 11.1 Write the failing test for the run-log adapter: it projects an `AdvisorRunReceipt` union onto one `ai_advisor_runs` row, `tools_called` persists as a JSON array of `AdvisorToolName` and reads back through `z.enum(ADVISOR_TOOL_NAMES)` with an unrecognized name failing to parse, and writing the same `runId` twice still leaves exactly one row. Run it, confirm red, then implement the adapter against `IAdvisorRunLogPort`.
- [ ] 11.2 Write the failing test for the Functional Sandwich order: with `language` and `base_currency` set, both are read via `IUserSettingsPort` and reach the adapter's request context **before** any model call is made. Run it, confirm red.
- [ ] 11.3 Write the failing test for receipt persistence on the terminal event: a run yielding `completed`, `refused`, or `failed` writes exactly one `ai_advisor_runs` row with the matching `outcome` — one row, not zero and not two. Run it, confirm red.
- [ ] 11.4 Write the failing test for the cancellation path, which is the one outcome with **no** terminal event: a consumer that abandons iteration mid-run still causes exactly one row with `outcome = 'aborted'` — written from the use case's `finally` around the `yield*` delegation — and **no** terminal event is emitted to the consumer. Run it, confirm red.
- [ ] 11.5 Implement `core/application/use-cases/AskAdvisorUC.ts`: resolve context impurely (settings + model chain), delegate through `IAdvisorPort`, and persist via `IAdvisorRunLogPort` on the terminal event or from the `finally` — never depending on a terminal event being observed. No business logic beyond orchestration.
- [ ] 11.6 Write the failing test for the read-only invariant end to end: asking the advisor to change, delete, or add an asset quantity terminates with a terminal event and leaves every asset quantity, cost basis, and fiscal figure byte-identical. Run it, confirm red, then confirm green.
- [ ] 11.7 Prove it can fail: make the terminal-event branch skip persistence, confirm 11.3's exactly-one-row assertion goes red while 11.2's ordering assertion stays green, restore.
- [ ] 11.8 Prove it can fail: remove the `finally`, confirm 11.4's `aborted` assertion goes red while 11.3 stays green — the two paths must be independently load-bearing. Restore.
- [ ] 11.9 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 12. DTO boundary and advisor routes

- [ ] 12.1 Write the failing test for `toWireEvent(event: AdvisorEvent): AdvisorStreamEvent` in `infrastructure/dtos/advisor.ts`: every domain event maps to its wire counterpart per D2's table (`completed` → `done`), and the result parses through `advisorStreamEventSchema`. Run it, confirm red, then implement.
- [ ] 12.2 Write the failing test asserting `toWireEvent` is the single conversion site — no other file converts `AdvisorEvent` to `AdvisorStreamEvent`. Run it, confirm red, then confirm green.
- [ ] 12.3 Write the failing tests for `askAdvisorRequestSchema` via `zValidator('json', …)`: an empty `message`, a `message` over 4000 characters, and a non-UUID `threadId` are each rejected and **no run is started**. Run them, confirm red, then implement.
- [ ] 12.4 Write the failing test for `advisorConfigSchema`: each provider entry carries a `category` and a `{ kind: 'present' } | { kind: 'absent' } | { kind: 'locked' }` credential state (never `hasKey: boolean`), and the response contains no API key, key prefix, or ciphertext. Run it, confirm red, then implement.
- [ ] 12.5 Write the failing tests for the SSE route, following the `routes/market.ts` `streamSSE` precedent: response content type is `text/event-stream`; frames arrive incrementally rather than as one buffered body; a `token` frame's wire bytes carry `event: token` and a `data:` line parsing to `{ kind: 'token', text: … }`. Run them, confirm red.
- [ ] 12.6 Write the failing test asserting every outbound frame is `advisorStreamEventSchema.parse`d before `writeSSE`, so a malformed frame is a server-side failure rather than a client mystery. Run it, confirm red.
- [ ] 12.7 Write the failing tests for terminal-frame discipline: exactly one frame has a kind in `{done, refused, failed}` and it is last; a successful run's `done` carries `runId`, `providerId`, `modelId`, `usage.inputTokens`, `usage.outputTokens`, and `toolsCalled`; a guardrail trip emits `refused` and no `done`; an unanticipated adapter throw still writes `failed` with code `INTERNAL_ERROR` before closing; and a `tool-error` frame is **not** terminal — the run continues and may still end `done`. Run them, confirm red.
- [ ] 12.8 Write the failing test for keep-alives: during a long model pause a `: keep-alive` **comment** line is written every 15s, the client parser produces no event from it, and no token is appended. Run it, confirm red.
- [ ] 12.9 Write the failing test for disconnect propagation: aborting the request fires `stream.onAbort`, which stops iterating the port's `AsyncIterable` and releases the model call. Run it, confirm red.
- [ ] 12.10 Write the failing tests for the non-streaming ask route and `advisorAnswerSchema`: a completed run returns `{ outcome: 'completed', text, receipt }` where `text` equals the concatenation of the token events a streaming run of the same request would emit; a guardrail trip returns `outcome: 'refused'` with reason and processor id and no text; an empty chain returns `outcome: 'failed'` with `NO_MODEL_AVAILABLE` and no text; a client hanging up still leaves an `aborted` audit row. Run them, confirm red.
- [ ] 12.11 Implement the three advisor routes (non-streaming ask, SSE stream, config read+write) in `infrastructure/routes/`, both ask routes calling the same `AskAdvisorUC` and wrapping the whole run so even an unexpected throw emits `failed` / `INTERNAL_ERROR`. Routes validate, delegate, map through `toWireEvent` (or fold, for the non-streaming one), and return DTOs — no model call, no tool invocation, no prompt construction, no figure computation. Confirm 12.5–12.10 green.
- [ ] 12.12 Prove it can fail: remove the run-wrapping catch so an adapter throw escapes without a `failed` frame, confirm 12.7's unexpected-throw assertion goes red, restore.
- [ ] 12.13 Prove it can fail: emit the keep-alive as a `data:` line instead of a comment, confirm 12.8's no-token-appended assertion goes red, restore.
- [ ] 12.14 `$N24 pnpm --filter @kryptofolio/backend typecheck && ... test`.

## 13. DI wiring and `AppType` registration

- [ ] 13.1 Wire the composition root in `infrastructure/di/`: construct the three tool factories with only their use cases, the model-chain resolver, the output processor, `MastraAdvisorAdapter`, the run-log adapter, and `AskAdvisorUC`. Point Mastra's libsql storage and `Memory` at their own `ai-advisor.db`, separate from the ledger SQLite.
- [ ] 13.2 Register the advisor routes in `app.ts`'s fluent `.route()` chain (chaining is mandatory for inference). Mount no generic agent handler and no `@mastra/hono` router.
- [ ] 13.3 Write the failing test asserting no catch-all agent endpoint exists and no route delegates to a third-party agent HTTP handler. Run it, confirm red, then confirm green.
- [ ] 13.4 Confirm `AppType` still resolves every pre-existing route as well as the new ones: `$N24 pnpm --filter @kryptofolio/backend typecheck` must pass, and a `hc<AppType>` call against the advisor config route must typecheck.
- [ ] 13.5 Write the failing test for the disposability guarantee: deleting `ai-advisor.db` and restarting leaves every `ai_advisor_runs` row intact, removes all threads/messages/traces, and breaks no other feature. Run it, confirm red, then confirm green.

## 14. Frontend port, transport adapter, and state-only composable

- [ ] 14.1 Write the failing test for the frontend `IAdvisorPort`: it declares `ask(request, signal): AsyncIterable<AdvisorStreamEvent>` plus the non-streaming config methods, mirroring how `IMarketDataPort.subscribeToStream` already declares streaming in the domain layer. Run it, confirm red, then add the port under `core/domain/ports/`.
- [ ] 14.2 Write the failing tests for `RestAdvisorAdapter` as the transport owner: it performs the `fetch` POST, reads the response `ReadableStream`, parses SSE frames, **ignores comment lines**, validates every frame through `advisorStreamEventSchema`, and yields `AdvisorStreamEvent`s. Run them, confirm red.
- [ ] 14.3 Write the failing test asserting a frame that fails validation is reported to the `errorBus` — the controlled-error path every other `Rest*Adapter` uses — and surfaces as an error state, never as a token and never silently. Run it, confirm red.
- [ ] 14.4 Write the failing test asserting the adapter uses no `EventSource`, so a completed LLM call can never be silently re-run by automatic reconnection. Run it, confirm red, then implement the adapter under `core/infrastructure/adapters/`.
- [ ] 14.5 Write the failing test for the config path: `getConfig` / `setModelChain` go through `bffClient` and their responses are validated by the shared schemas, mapping snake_case → camelCase at the DTO layer. Run it, confirm red, then implement.
- [ ] 14.6 Write the failing test asserting the composable is transport-free: `useAdvisorChat` contains no `fetch`, no `ReadableStream` reader, no SSE parsing, and no `EventSource` — it consumes the port's `AsyncIterable`. Run it, confirm red.
- [ ] 14.7 Write the failing test for `transport-lost`: iteration ending after some `token` events and before any terminal event puts the composable in a synthesized local `{ kind: 'transport-lost' }` state that does **not** report success and offers explicit retry. Run it, confirm red.
- [ ] 14.8 Write the failing test for cancellation: the composable holds the `AbortController`, passes its signal to `IAdvisorPort.ask`, and `abort()` ends the run with nothing auto-reconnecting or auto-re-running — retry is always an explicit user action. Run it, confirm red.
- [ ] 14.9 Write the failing test for thread continuity: a follow-up sends the `threadId` reported by the previous terminal event, and starting a new conversation omits `threadId`. Run it, confirm red.
- [ ] 14.10 Implement `useAdvisorChat` as state only: token accumulation, the per-`callId` tool-activity map, the `AbortController`, the thread id, and a state union covering streaming / `refused` / `failed` with code / `transport-lost` / user-aborted. Confirm 14.6–14.9 green.
- [ ] 14.11 Keep the advisor config on Pinia Colada: write the failing test asserting the panel's non-streaming config and credential states are fetched through a `useQuery` composable under `composables/queries/` via the same port, and that no Pinia Colada query wraps the token stream. Run it, confirm red, then implement.
- [ ] 14.12 Prove it can fail: truncate the stream before the terminal event in the test double and confirm the composable does **not** report success — the second of the two likeliest vacuous-pass shapes. Then break the absence-of-terminal-event detection so it defaults to success, confirm 14.7's assertion goes red, restore.
- [ ] 14.13 Prove it can fail: swallow a schema-validation failure in the adapter instead of reporting it, confirm 14.3's `errorBus` assertion goes red, restore.
- [ ] 14.14 `$N24 pnpm --filter @kryptofolio/frontend typecheck` (`vue-tsc --build --force`) `&& ... test`.

## 15. Global chat panel UI

- [ ] 15.1 Read `DESIGN.md` first, then write the failing test asserting every color and surface class used by the panel resolves to a token defined in `DESIGN.md`, with no invented Tailwind class. Run it, confirm red.
- [ ] 15.2 Implement the global chat panel as `<script setup lang="ts">`, openable from any view without navigating away, with no per-view embedded insights in this phase.
- [ ] 15.3 Write the failing tests for the distinct states, one assertion each: empty conversation renders a first-question prompt with no error and no spinner; streaming-in-progress; `refused` presented as completed-but-withheld with the reason, visually distinct from `failed`; `failed` with code `NO_MODEL_AVAILABLE` renders a call to action linking to credential settings rather than a generic error; `transport-lost` with retry; and user-aborted keeps the partial answer visible marked as stopped by the user with **no** error state. Run them, confirm red, then implement.
- [ ] 15.4 Write the failing test for tool-activity display: `tool-start` then `tool-result` for a `callId` shows that tool running then finished, keyed by `callId`. Run it, confirm red, then implement.
- [ ] 15.5 Write the failing test for the new-conversation affordance: starting one clears the thread and shows the empty state. Run it, confirm red, then implement.
- [ ] 15.6 Prove it can fail: collapse the aborted state into the error state, confirm 15.3's no-error-state-on-abort assertion goes red, restore.
- [ ] 15.7 `$N24 pnpm --filter @kryptofolio/frontend typecheck && ... test`.

## 16. Whole-change verification

- [ ] 16.1 Run the zero-`any` grep over the AI subtree and `MastraAdvisorAdapter.ts` for `: any|as any|<any>|, any>|as never` — note `, any>` catches the `Record<string, any>` case the narrower pattern misses. Zero hits is an acceptance criterion, not a review discovery.
- [ ] 16.2 Run the single-import-site grep: every `@mastra/` import in the repository is inside `MastraAdvisorAdapter.ts`.
- [ ] 16.3 Run the money-handling greps over the AI subtree: zero hits for `Number(`, `parseFloat`, `toFixed`, `Intl.NumberFormat`, `decimal.js`, and `.sort(`. Then review by hand that no monetary value is compared there — every comparison is delegated to `Money` in `core-domain`.
- [ ] 16.4 Inspect the full diff and confirm rule 6 holds structurally: no DuckDB view, FIFO materializer, or custody allocation is modified, and no `PARTITION BY` or `ORDER BY` SQL clause is added anywhere. The one ordering introduced is `rankHoldingsByValue`, a pure display ranking over a materialized snapshot with no access to a lot, a queue, or an account.
- [ ] 16.5 Confirm the rollback story is real: with `ai_advisor_model_chain` unset, both ask routes answer `NO_MODEL_AVAILABLE` and nothing else in the app changes.
- [ ] 16.6 Run `$N24 pnpm typecheck && $N24 pnpm test` at the root and compare against the 1.1 baseline — every previously green package is still green.
- [ ] 16.7 Commit locally with the Node 24 `PATH` prefix so the Husky hook does not fail on `node:sqlite` under the shell default v20.20.0. No push unless explicitly asked.
