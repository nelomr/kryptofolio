# global-error-handling Specification

## Purpose
TBD - created by archiving change hex-arch-zod-refactor. Update Purpose after archive.
## Requirements
### Requirement: Global error notification for validation failures
The system SHALL intercept Zod `safeParse` failures in the adapters and trigger a global error notification (e.g., a Toast) to inform the user of the data corruption. The Toast SHALL render as a fixed-position overlay above page content, outside the normal document flow, so it neither adds to document height nor causes page scroll.

This applies to **every** adapter and to **per-row** parsing, not only to whole-payload parsing. A row that fails validation SHALL NOT be discarded without a trace: the bare `if (result.success) { push }` with no `else` branch is a violation of this requirement. Rejections SHALL be reported through the application's existing validation-error channel — the `errorBus` `validation-error` emission already performed by `parseOrFail` — and NOT through `console` alone; a `console.warn` is not an observable surface for a user or for a spec, and where one stands in as the reporting mechanism it SHALL be replaced.

Two constraints bound the behaviour:

- **A rejected row SHALL NOT invalidate the response.** Throwing from inside a per-row loop turns one malformed row into an empty result, which is indistinguishable from "no data" and is itself the failure mode this requirement exists to prevent. A rejected row is skipped; accepted rows are returned.
- **Notification volume SHALL be bounded: one event per call, not one per row.** The loop accumulates rejections and emits a single `validation-error` after it finishes, carrying the calling context, the number rejected and the number accepted. Individual rejections MAY still be logged to the console for diagnosis, but the user-facing notification is aggregated.

#### Scenario: Malformed external data received
- **WHEN** the external API returns data that fails the Zod schema validation
- **THEN** the `RestCryptoAdapter` logs the specific validation errors to the console
- **AND** a global Toast notification (built strictly following `shadcn-vue` guidelines) is displayed indicating that external data was malformed
- **AND** the application state does not crash, returning a safe fallback or throwing a controlled domain error that the store catches

#### Scenario: Toast renders as a floating overlay, not in document flow
- **WHEN** a global Toast notification is triggered, whether for a validation failure or any other event that raises one (e.g. a settings save confirmation)
- **THEN** the Toast container is rendered with fixed positioning above the page's visible content
- **AND** the Toast container does not occupy space in the normal document flow
- **AND** the page's total document height and scroll state are unaffected by the Toast being shown, dismissed, or stacked with other Toasts

#### Scenario: A rejected row leaves a trace
- **WHEN** an adapter parses a list response row by row and one row fails `safeParse`
- **THEN** the rejection MUST be reported, carrying the calling context and the Zod error
- **AND** no adapter parsing loop MUST contain a success branch with no failure branch

#### Scenario: Rejections travel the errorBus, not the console
- **WHEN** a row is rejected in any adapter
- **THEN** the report MUST be emitted as a `validation-error` on the `errorBus`
- **AND** a `console` call MUST NOT be the only reporting path
- **AND** an existing `console.warn`-and-skip site MUST be replaced by the `errorBus` emission rather than kept beside it

#### Scenario: Invalid rows do not turn a response into an empty one
- **WHEN** a response contains one valid row and one invalid row
- **THEN** the adapter MUST return the one valid entity
- **AND** it MUST NOT throw, and MUST NOT return an empty list
- **AND** the outcome MUST be distinguishable from a genuinely empty response by the emitted rejection report

#### Scenario: Notification volume is one event per call
- **WHEN** a single adapter call rejects one hundred rows
- **THEN** exactly one `validation-error` MUST be emitted for that call
- **AND** it MUST report the rejected count and the accepted count
- **AND** one notification per rejected row MUST NOT be produced

