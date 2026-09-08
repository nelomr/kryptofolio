# Domain Anti Corruption Specification

## Purpose

The client boundary refusing to fabricate: an unknown value never becomes zero, frontend parsers are verified against real backend payloads, and ingested identifiers are derived rather than random.
## Requirements
### Requirement: An Unknown Value Never Becomes Zero at the Client Boundary

The anti-corruption layer SHALL preserve the distinction between a value that is **absent or unresolved** and a value that is **genuinely zero**. A field the backend can legitimately send as `null` SHALL NOT be coerced to `0` on parse.

`numericField` in `CommonSchemaHelpers` opens with `if (val === null || val === undefined) return 0`, and the same coercion is duplicated in `MockDtoSchemas` and `ExternalFuturesSchemas`. `CommonSchemaHelpers` additionally maps an empty string to `0`. This is the surviving twin of the `COALESCE(price, 1.0)` that this change removed from SQL: a fabricated number standing in for missing knowledge, one layer further out, failing silently.

The correction SHALL be surgical, not global. `numericField` is applied at 210 call sites across seven DTO modules, and most of those fields legitimately want `0` when the value is missing. Changing the shared helper would turn every absent number into `null` and break rendering across the application. A separate nullable variant SHALL be introduced and applied **only** to the fields the backend can send as `null` — unresolved proceeds and their derived gain.

#### Scenario: An unresolved sale price stays unresolved

- **WHEN** the backend sends `sale_price_eur: null` because no price could be resolved and none was assigned manually
- **THEN** the parsed DTO MUST carry `null`
- **AND** it MUST NOT carry `0`
- **AND** the view MUST render it as pending rather than as a zero-value disposal

#### Scenario: A genuinely zero value is still zero

- **WHEN** a field's value is legitimately `0` — a free acquisition, a waived fee
- **THEN** the parsed DTO MUST carry `0`
- **AND** it MUST NOT be confused with an unresolved value

#### Scenario: Fields that want a zero default keep it

- **WHEN** a field not on the nullable list arrives absent
- **THEN** the existing `numericField` behaviour MUST be unchanged, so no rendering path regresses

#### Scenario: An empty string is not a number

- **WHEN** a numeric field arrives as `''`
- **THEN** it MUST be treated as absent under the same rule as `null`, not silently converted to `0`

### Requirement: Frontend Parsers Are Verified Against Real Backend Payloads

The frontend DTO suite SHALL validate at least one **actual backend response shape** per endpoint it consumes, rather than only fixtures it authors itself.

The existing `zod-schemas.test.ts` has 15 tests and constructs all of its own inputs. That is why both the stale status vocabulary and the null-to-zero coercion survived undetected while the frontend suite reported 271 passing tests: a schema and a fixture written by the same hand agree with each other by construction, whatever the backend actually sends.

A parser's declared shape SHALL be derived from the shape **measured at the emitter** that its route serves — the adapter or port implementation that constructs the payload — and never from an assumed or remembered shape. A parser that cannot parse any payload its sole route produces is a **defect**, not defensive tolerance: it is the anti-corruption layer failing to perform its only role, and it fails silently because a rejected row looks identical to no data. Accordingly:

- A DTO schema SHALL NOT declare keys, aliases or alternate spellings for which no emitter exists. Tolerance for a shape with no producer is dead code that reads as a contract, and it keeps a schema green against payloads no route sends.
- A route and the schema that parses it SHALL NOT diverge in key casing or key naming without a test failing visibly.
- The rule applies to a field's **values**, not only to its keys. Where the emitter's value set is a closed enumeration, the parser SHALL declare that enumeration closed, and the mapping from it into the consuming vocabulary SHALL be **total** — every emitter value SHALL have a destination, and no accepted spelling SHALL exist that the emitter never sends. An unmapped value SHALL be a reported rejection, never a silent fallback to a catch-all member: a catch-all reached by a value the emitter routinely sends is the same silent failure as an unparseable payload, differing only in that it reaches the screen.

`CexFuturesLedgerSchema` is the measured instance: it required `id` and read snake_case transaction keys (`realized_pnl`, `trade_price`, `fee_eur`, `pnl`, `contract`, `date`) while its only route served a camelCase per-contract aggregate with no `id`, so `getFuturesDerivatives()` returned `[]` for every user, always — and `futures-schemas.test.ts` asserted alias tolerance for a shape that route never sent, staying green over dead code.

#### Scenario: The canonical status vocabulary parses

- **WHEN** the fiscal DTO schemas are exercised against a payload built from the backend's own DTO definitions
- **THEN** `OPEN`, `PARTIAL` and `CLOSED` MUST parse
- **AND** the retired `FULL` / `EMPTY` values MUST be rejected with an `errorBus` emission

#### Scenario: A nullable field survives the round trip

- **WHEN** the backend response carries `null` in a nullable monetary field
- **THEN** the frontend parse MUST preserve it
- **AND** the test MUST fail if a coercion reintroduces `0`

#### Scenario: A backend field added without a frontend counterpart is caught

- **WHEN** the backend response contains a field the frontend schema does not declare
- **THEN** the divergence MUST be reported by the suite rather than silently dropped

#### Scenario: A schema is written against the emitter's measured shape

- **WHEN** a DTO schema for a route is authored or rewritten
- **THEN** every declared key MUST correspond to a key the route's emitter constructs
- **AND** each key's optionality MUST match the emitter's own optionality, so a field the emitter can omit is optional and a field it always sets is required
- **AND** a declared key with no emitter MUST be removed rather than retained as tolerance

#### Scenario: A contract test exercises the emitter's real payload

- **WHEN** the contract test for a route's parser is run
- **THEN** its input MUST be the object shape the emitter constructs, field for field
- **AND** the assertions MUST be on the resulting entity's populated fields, not merely on parse success, so a parse that succeeds while silently dropping fields fails the test
- **AND** a test asserting tolerance for a shape the route never emits MUST be deleted rather than kept passing

#### Scenario: Every value of a closed emitter enumeration has a destination

- **WHEN** a parser maps a field whose emitter value set is a closed enumeration into a consuming vocabulary
- **THEN** every value of that enumeration MUST map to a distinct, meaningful member of the consuming vocabulary
- **AND** the mapping MUST be exhaustive by type, so adding a value at the emitter fails the consumer's typecheck rather than degrading at runtime
- **AND** a value the emitter routinely sends MUST NOT resolve to a catch-all or unknown member

#### Scenario: An off-vocabulary value is rejected, not absorbed

- **WHEN** a payload carries a value outside the emitter's declared enumeration for that field
- **THEN** the row MUST be rejected and reported through the validation-error channel
- **AND** it MUST NOT be admitted as a catch-all member and rendered as though it parsed

#### Scenario: An accepted spelling with no emitter is removed

- **WHEN** a parser's value mapping accepts a spelling or casing the route's emitter never sends
- **THEN** that entry MUST be removed
- **AND** a test that relies on it MUST be rewritten against the emitter's own spelling, since such a test can pass while the real contract remains broken

#### Scenario: A route and its schema cannot diverge in key shape unnoticed

- **WHEN** a route's emitted keys and its parsing schema's declared keys disagree in naming or casing, so that no payload can parse
- **THEN** a test MUST fail
- **AND** the failure MUST NOT be observable only as an empty result list

### Requirement: Ingested Transaction Identifiers Are Derived, Never Random

Every CSV parser SHALL derive a transaction identifier deterministically from the row's own content when the source provides no identifier of its own. A parser SHALL NOT substitute a random value.

Three parsers currently fall back to `Math.random()`: `KrakenSpotCsvParser` at line 126, `BitvavoCsvParser` at line 69, and `BitUnixCsvParser` at line 61. A random identifier makes re-ingesting the same file produce duplicates instead of resolving to the same rows, which contradicts the idempotency the rebuild and reconciliation model depends on.

#### Scenario: Re-ingesting one file twice yields the same identifiers

- **WHEN** a file whose rows carry no source identifier is ingested twice
- **THEN** both passes MUST produce identical transaction identifiers
- **AND** the second pass MUST NOT create duplicate ledger rows

#### Scenario: Two distinct rows never collide

- **WHEN** two rows in the same file differ in any mapped field
- **THEN** their derived identifiers MUST differ

#### Scenario: No parser retains a random fallback

- **WHEN** the parsers are searched for `Math.random()`
- **THEN** no identifier-producing path MUST contain it

