## ADDED Requirements

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
