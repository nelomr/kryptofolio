## ADDED Requirements

### Requirement: A Source Format Profile Declares Only What Reading and Mapping Cannot Express

The ingestion pipeline SHALL have three layers with distinct responsibilities, and a source-specific declaration SHALL exist for exactly the facts that neither of the first two can carry.

1. **Reader** (`apps/frontend/src/modules/data-ingestion/utils/parsers.ts`) turns bytes into rows of strings. It is source-agnostic and MUST remain so.
2. **Column mapping** (`guessColumnMapping` in `AutoMapColumnsUseCase.ts` plus the wizard's user confirmation) turns header names into canonical fields. It is retained.
3. **Source format profile** declares the per-source conventions that a header name cannot state.

A header-name mapper can say *"the column `Comisión de la operación` holds `fee_amount`"*. It structurally cannot say *"that number is a EUR valuation of a fee actually paid in the asset, and the real quantity is `Cantidad de origen − Cantidad de destino`"*. That second class of fact is what the profile exists for, and it was measured on the user's real exports rather than anticipated — see `design.md` D21 through D24.

A profile SHALL be a declarative value. It SHALL NOT read a file, open a stream, take a `File`, or return domain entities.

#### Scenario: The profile is data, not a parser

- **WHEN** a source format profile is inspected
- **THEN** it MUST be a plain readonly value with no method that performs I/O
- **AND** it MUST NOT accept a `File`, an `ArrayBuffer`, or a stream
- **AND** the reader MUST contain no source-specific branch other than the file-extension choice between the CSV and spreadsheet readers

#### Scenario: Every profile is total over the profile vocabulary

- **WHEN** the profile table is type-checked
- **THEN** it MUST be typed as `Record<SourceProfileId, SourceFormatProfile>` so that adding a member to the identifier vocabulary without a profile entry is a compile error
- **AND** a unit test MUST assert that the table's keys equal the identifier vocabulary exactly, with no missing and no extra key

#### Scenario: Each declared dimension is a discriminated union, not an optional flag

- **WHEN** a profile declares its fee denomination, its fee convention, its directional-fill rule, or its invariant
- **THEN** each MUST be expressed as a discriminated union over a `kind` field
- **AND** no dimension MUST be expressed as a set of independent optional booleans
- **AND** no field in the profile type MUST be typed `any`

### Requirement: Profile Selection Is Evidence-Based and Never Resolved by List Order

A profile SHALL be selected by matching a declared header signature, and an ambiguous or unrecognised file SHALL be reported as such rather than resolved silently.

The five exchange parsers being deleted had one correct idea — `detect(headers)` — and one defect in how it was used. `REGISTERED_PARSERS` documents it explicitly: *"Order matters for `detect()` — parsers are checked in sequence. Bit2Me should be checked BEFORE Tangem since Tangem is a catch-all"*. That makes the outcome of two matching signatures depend on array position. `TangemCsvParser` already showed the correct shape instead: a required-header set **and** an excluded-header set, so a catch-all needs negative evidence before it wins.

**Detection is a suggestion, never a decision, and that is what bounds the risk.** The selected profile is a required field on the ingestion contract and the user confirms it in step 1, so the backend never infers one. Excluded-header sets therefore serve only to pick a sensible **default** for that control; they are not a correctness mechanism, and they do not need to be exhaustive. Tangem's `Date,Type,Asset,Amount,Fee,Notes` signature is a genuine subset of what a minimal export from another exchange could produce, and six files cannot settle the correct exclusions — so a misdetection must degrade into a wrong default in a selector the user can change, never into wrongly interpreted data.

#### Scenario: An ambiguity leaves the selection unmade

- **WHEN** a header row satisfies more than one profile signature
- **THEN** the wizard MUST leave the profile unselected and require the user to choose before proceeding
- **AND** it MUST NOT default to any candidate, since a default among equals is the array-order defect wearing a different hat

#### Scenario: A real export resolves to its profile from headers alone

- **WHEN** `detectSourceProfile` is given the header row of `kraken_spot.csv` — `txid, refid, time, type, subtype, aclass, subclass, asset, wallet, amount, fee, balance`
- **THEN** it MUST resolve to the Kraken spot profile
- **WHEN** it is given `Tipo de operación, Cantidad de destino, Moneda de destino, Cantidad de origen, Moneda de origen, Comisión de la operación, Moneda de la comisión, Exchange, Grupo, Descripción, Fecha`
- **THEN** it MUST resolve to the Bit2Me profile
- **AND** the same MUST hold for the Bitvavo, Bitunix, Tangem, and Kraken futures header rows

#### Scenario: Two matching signatures are an ambiguity, not a race

- **WHEN** a header row satisfies the signature of more than one profile
- **THEN** detection MUST report the ambiguity together with every candidate
- **AND** it MUST NOT pick one by declaration order or array position

#### Scenario: An unrecognised file is still ingestible, and says so

- **WHEN** a header row matches no profile signature
- **THEN** detection MUST report the file as unrecognised
- **AND** ingestion MUST remain possible under a generic profile whose undetermined dimensions are reported pending review rather than assumed
- **AND** the file MUST NOT be silently treated as any named source

#### Scenario: The user's confirmation overrides detection

- **WHEN** the user selects a profile explicitly in the wizard
- **THEN** the selected profile MUST be used
- **AND** the detected profile MUST be shown as the default so a correct detection needs no action

### Requirement: The Profile Supersedes Guessing the Market From the File Name

Market type SHALL be derived from the resolved profile, not from the file's name. `detectMarketTypeFromFile` currently decides between spot and futures by searching the file name for `future`, `futuro` or `deriv`, so a Kraken futures export saved under any other name is ingested as spot.

A profile knows its market as a declared fact: the Kraken futures signature carries `funding rate`, `realized pnl` and `position uid`, none of which a spot export has. Keeping both mechanisms would leave two detections able to disagree about one file, and the weaker of the two would be the one the user cannot see the reasoning for.

#### Scenario: Market type follows the resolved profile

- **WHEN** a file resolves to a profile that declares its market
- **THEN** the wizard's market type MUST be set from the profile
- **AND** `detectMarketTypeFromFile` MUST NOT be consulted for that file

#### Scenario: A misleading file name no longer decides

- **WHEN** a Kraken futures export is saved under a name containing no futures keyword
- **THEN** it MUST still be ingested as futures, because its header row resolves to the futures profile

#### Scenario: The user can still correct the market type

- **WHEN** the profile is unrecognised or the user disagrees
- **THEN** the existing market-type control MUST remain editable, exactly as it is today
- **AND** an explicit user choice MUST win over the profile's declaration

### Requirement: The Profile Declares the Fee's Denomination

Each profile SHALL declare how a row's fee denomination is resolved. Ingestion SHALL NOT apply a global default, and SHALL NOT fall back to the row's own asset except where the profile declares that the source has no fee-currency column at all.

Four conventions were measured across five real exports, and one source uses two of them inside a single file, which is why a per-source *default* is not merely imprecise but wrong (`design.md` D22):

| source | declared denomination |
|---|---|
| Kraken spot | the row's own asset — there is no fee-currency column |
| Bitvavo | the named `Fee currency` column, which really does vary per row: `EUR` on a `buy`, `XRP` on a `withdrawal` |
| Bitunix | the named `Fee Asset` column |
| Bit2Me | `Moneda de la comisión` is `EUR` on all 45 movement rows and the number beside it is a **fiat valuation**, not a quantity |
| Kraken futures | the collateral currency |

The distinction decides quantity versus basis: a fee paid in the asset is a disposal that reduces the quantity remaining in a lot, and a fee paid in fiat adjusts the basis and must leave every quantity untouched.

#### Scenario: A source with no fee-currency column resolves to the row's asset

- **WHEN** a Kraken spot row carries `asset = PUMP` and `fee = 17.720`
- **THEN** the fee MUST resolve to `17.720 PUMP`
- **AND** the resolution MUST come from the profile declaring that this source names no fee currency, not from a global fallback

#### Scenario: A per-row fee currency is read per row

- **WHEN** a Bitvavo `buy` names `Fee currency = EUR` and a Bitvavo `withdrawal` in the same file names `Fee currency = XRP`
- **THEN** the first MUST be treated as a fiat fee adjusting the basis with no quantity effect
- **AND** the second MUST be treated as a fee denominated in the asset

#### Scenario: A fiat valuation of a fee is not a fee quantity

- **WHEN** a Bit2Me row carries `Comisión de la operación = 0.210620368` with `Moneda de la comisión = EUR` while both sides name `HBAR`
- **THEN** that number MUST NOT be recorded as a fee quantity in `HBAR`
- **AND** the fee quantity MUST be derived per the profile's fee convention

#### Scenario: An unresolvable denomination is reported, not assumed

- **WHEN** a non-zero fee appears on a row whose profile cannot resolve its denomination
- **THEN** the row MUST be reported pending review
- **AND** no denomination MUST be assumed for it

### Requirement: The Profile Declares Whether the Reported Amount Already Includes the Fee

Each profile SHALL declare which two of the three quantities `gross`, `net`, and `fee` the source supplies, so the third is derived rather than guessed. Every movement satisfies `gross = net + fee` (`design.md` D24).

Deducting a fee the source has already applied destroys quantity that is still held; ignoring one charged on top leaves quantity unaccounted for. Both are silent.

#### Scenario: A source supplying net and fee derives the gross

- **WHEN** a Kraken spot withdrawal reports `amount = -0.006` and `fee = 0.005`
- **THEN** `0.006` MUST be the quantity that moves to the destination
- **AND** `0.005` MUST be recorded as the fee
- **AND** the gross debited MUST be `0.011`, matching the row's own `balance` movement

#### Scenario: A source supplying gross and net derives the fee

- **WHEN** a Bit2Me withdrawal reports `Cantidad de origen = 2.236429 HBAR` and `Cantidad de destino = 1.536429 HBAR`
- **THEN** the fee MUST be derived as `0.7 HBAR`, denominated in the asset
- **AND** the quantity credited to the destination MUST be the net `1.536429`, never the gross

#### Scenario: A fee already inside the reported total is not added again

- **WHEN** a Bitvavo `buy` reports `0.30338 ETH` at `1645` for a paid total of `499.81 EUR` with a `0.7499 EUR` fee
- **THEN** the acquisition's cost basis MUST be `499.81`
- **AND** it MUST NOT be raised to `500.5599`

#### Scenario: A zero fee needs no convention

- **WHEN** a row's fee amount is an explicit `0`
- **THEN** both conventions MUST produce the same result, since `gross = net + 0`
- **AND** the row MUST NOT be reported pending review
- **AND** an **absent** fee — an empty cell rather than a `0` — MUST remain distinguishable from it and MUST be the state that is reported

#### Scenario: Fee arithmetic is exact

- **WHEN** any of `gross`, `net`, or `fee` is derived from the other two
- **THEN** the arithmetic MUST use `PreciseAmount` / `decimal.js`
- **AND** no `number` MUST appear anywhere on that path

### Requirement: The Profile Declares Whether One Source Row Fills Both Directional Sides

Each profile SHALL declare whether the source writes a one-sided movement onto both directional columns, and normalisation SHALL reduce such a row to exactly one directional side before it reaches the ledger.

All 42 Bit2Me `Deposit` rows carry the same asset and the same amount on both sides. `v_custody_movements`'s `legs` CTE is a `UNION ALL` of the OUT and IN sides, so such a row yields **two** legs on the same account which net to exactly zero against the same synthetic counterparty: the deposit lands nowhere and nothing flags it, because a net of zero leaves no imbalance to flag. 34 of those rows are EUR and harmless; 8 are crypto — HBAR ×4, USDC, XRP, ETH, ADA.

#### Scenario: A duplicated deposit keeps only its inbound side

- **WHEN** a source declared as writing both sides reports a `Deposit` with identical asset and amount in the origin and destination columns
- **THEN** the persisted transaction MUST carry `amount_in` set to the destination quantity
- **AND** the outbound side MUST be dropped
- **AND** the custody ledger MUST see exactly one leg for that row

#### Scenario: A duplicated withdrawal keeps its outbound net side and its derived fee

- **WHEN** a source declared as writing both sides reports a `Withdrawal` whose origin exceeds its destination in the same asset
- **THEN** the persisted transaction MUST carry `amount_out` set to the destination quantity as the net moved
- **AND** the fee MUST be the difference, denominated in the asset
- **AND** the inbound side MUST be dropped

#### Scenario: Normalisation happens before the ledger, not in the view

- **WHEN** a one-sided source row is reconciled
- **THEN** the reduction MUST be performed in the ingestion path
- **AND** the DuckDB views MUST read an already-normalised ledger with no compensating logic for a source that duplicates sides

#### Scenario: A source that writes one side is unaffected

- **WHEN** a profile declares that the source writes only the moving side
- **THEN** no side MUST be dropped
- **AND** the row MUST pass through the reduction step unchanged

### Requirement: The Profile Distinguishes Transaction References From Category Labels

Each profile SHALL declare which of its columns are genuine per-operation references and which are category labels, so a shared value is never mistaken for evidence that two rows are one operation.

`COLUMN_DICTIONARY` mapped `group` and `grupo` onto `group_id`, the field `aggregateRows()` merges on. Bit2Me's header is `Grupo` and its values are wallet compartments — `earn`, `trading`, `pocket`, `blockchain`, `bank-transfer` — so an entire multi-year history shares five values. Driving all 706 real rows through the actual aggregator produced **5** rows out, with `Σ amount_in` falling from 204 274 to 173 504: 499 staking rewards became one record. Two guards already shipped in the dictionary and the aggregator (`design.md` D20); this requirement makes the fact a declared property of the source rather than an entry in a shared list every source must agree on.

#### Scenario: A category column is never a merge key

- **WHEN** a profile declares a column as a category label
- **THEN** that column MUST NOT be used as an aggregation key
- **AND** it MUST NOT populate `transfer_group_id`
- **AND** ingesting the three real Bit2Me workbooks MUST yield one persisted transaction per source row

#### Scenario: A genuine reference is usable as a link

- **WHEN** a profile declares a column as a transaction reference — Kraken's `refid`
- **THEN** it MAY be used as an aggregation key and to populate `transfer_group_id`
- **AND** it MUST still pass the reference guard: same instant, at most two legs

#### Scenario: A source with no reference column declares none

- **WHEN** the Bit2Me profile is inspected
- **THEN** its declared reference columns MUST be empty
- **AND** `Grupo` MUST appear among its declared category labels
- **AND** the sub-wallet designation MUST still reach `metadata.wallet`, where the ingestion path reads it

### Requirement: A Profile Declares Whatever Independent Redundancy Its Source Ships

Every profile SHALL declare an invariant slot explicitly. Where the source ships redundancy **independent of the profile's own derivation**, that invariant SHALL be asserted against every row of the real export. A profile MAY declare that it has no such redundancy, but SHALL state that as a value rather than leave the slot unset, so a convention changing at the exchange is detected rather than silently absorbed.

The qualifying test is independence, not the presence of a particular column. A check built only from the values the profile itself derives is a **tautology** and MUST NOT be accepted as an invariant: for Kraken, Bitunix and Bit2Me, `gross = net + fee` holds by construction because the third value is derived from the other two, so asserting it can never fail. Two forms of genuine independence exist in the measured sources:

| form | source | why it is independent |
|---|---|---|
| running balance | Kraken spot | `balance` takes no part in the derivation; `balance = previous ± amount − fee` reconciled **8 of 8** rows and Kraken's own documentation states the formula verbatim |
| over-determined row | Bitvavo | `quantity × price + fee = paid` spans four columns none of which is derived from the others; measured exact on **12 of 12** rows |

Bit2Me, Bitunix and Tangem ship neither and declare none.

#### Scenario: A declared running-balance invariant is asserted per row

- **WHEN** a profile declares a running-balance column
- **THEN** every row of the real export MUST satisfy `balance = previous ± amount − fee` under the profile's declared fee convention
- **AND** a violation MUST be reported with the offending row rather than dropped

#### Scenario: An over-determined row is asserted across its independent columns

- **WHEN** a profile declares an over-determined-row invariant
- **THEN** every row MUST satisfy the declared relation among columns that are not derived from one another — for Bitvavo, `quantity × price + fee = paid`
- **AND** the arithmetic MUST use `PreciseAmount`, since the relation holds exactly and a float comparison would need a tolerance that hides real drift

#### Scenario: A tautological check is rejected as an invariant

- **WHEN** a profile's proposed invariant asserts only a relation the profile itself derives, such as `gross = net + fee` where `gross` is derived
- **THEN** it MUST NOT be accepted as an invariant
- **AND** the profile MUST declare no invariant instead, so the absence of verification is visible rather than simulated

#### Scenario: The invariant is what catches a convention change

- **WHEN** the fee convention of a profile carrying an invariant is deliberately inverted
- **THEN** the invariant check MUST fail
- **AND** the failure MUST name the profile and the first row that broke

#### Scenario: No invariant is a declared state, not an omission

- **WHEN** a source ships no independent redundancy
- **THEN** its profile MUST declare that explicitly
- **AND** the absence MUST NOT be expressible as an unset or missing field

#### Scenario: A failed invariant is surfaced before submission, not only in tests

- **WHEN** a file is dropped and its detected profile's invariant does not hold on the parsed rows
- **THEN** the wizard MUST report it in step 1, alongside the detected profile
- **AND** the report MUST distinguish "verified" from "could not be verified" from "verification failed"
- **AND** it MUST NOT silently proceed as though the convention were confirmed

### Requirement: The Selected Profile Reaches the Backend as Part of the Ingestion Contract

The profile identifier SHALL travel with the submitted rows, because the backend owns the semantics that consume it: `CsvIngestionUseCase` resolves types and fees, `FIFO_EVENT_POLICY` decides events, and row aggregation moves behind the ingestion boundary per `design.md` D25.

The profile SHALL be applied by one implementation, invoked from both sides — the backend for persistence and the frontend for preview — so the preview cannot disagree with what is stored.

#### Scenario: The submission carries the profile

- **WHEN** the wizard submits a batch
- **THEN** the request body MUST carry the selected profile identifier alongside `rows`, `market`, and `timezone`
- **AND** the identifier MUST be validated against the canonical vocabulary by the route's Zod schema
- **AND** an absent or unknown identifier MUST be rejected rather than defaulted to a named source

#### Scenario: Preview and persistence apply the same rules

- **WHEN** the same rows are previewed in the wizard and then persisted
- **THEN** every quantity, fee, and fee denomination shown in the preview MUST equal what is persisted
- **AND** both MUST be produced by the same pure functions, not by two implementations

#### Scenario: The profile vocabulary has one home

- **WHEN** the profile identifier vocabulary is located
- **THEN** it MUST be declared once and imported by every consumer
- **AND** no consumer MUST restate the list of source identifiers

### Requirement: Column Mapping and the User's Confirmation Survive Unchanged

The profile SHALL NOT replace, bypass, or pre-empt the column-mapping layer or the user's confirmation of it. The wizard's user-facing flow — drop a file, confirm the mapping, preview and validate, submit — SHALL survive intact.

#### Scenario: Auto-mapping and confirmation are unchanged

- **WHEN** a file is dropped
- **THEN** `guessColumnMapping` MUST still produce the initial mapping from the header names
- **AND** the user MUST still be able to change any column's mapped field before previewing
- **AND** a profile MUST NOT overwrite a mapping the user has confirmed

#### Scenario: The wizard keeps three steps

- **WHEN** the profile surface is added
- **THEN** `WizardStep` MUST remain `1 | 2 | 3`
- **AND** the profile MUST be presented within an existing step, not as a new one

#### Scenario: An unrecognised source does not block the wizard

- **WHEN** no profile matches the dropped file
- **THEN** the wizard MUST still reach the preview and the submit step
- **AND** the rows whose treatment is undetermined MUST be reported pending review rather than blocked

### Requirement: The Unreachable Exchange Parsers and Their Port Are Removed

The five parsers under `apps/frontend/src/core/infrastructure/csv/`, the `REGISTERED_PARSERS` registry, and the `ICsvIngestionPort` interface SHALL be deleted with their tests. They are unreachable, and their content contradicts the domain this change establishes.

Verified: nothing outside that directory and its own `__tests__` imports any of them, and the `MockTaxAdapter` that the registry's comment names as its consumer does not exist in the repository. `KrakenSpotCsvParser._parseSingleRow` maps `deposit → 'DEPOSIT'` while `classifyCustodyMovement` resolves a crypto deposit to `TRANSFER_IN`, and it returns `totalEur: 0, priceEur: 0, feeEur: 0` for every movement — discarding the fee entirely, which is the disposal this whole change exists to record. Keeping them leaves a second, contradictory ingestion model in the tree for the next reader to find.

#### Scenario: The files and the port are gone

- **WHEN** the change is complete
- **THEN** `KrakenSpotCsvParser`, `BitvavoCsvParser`, `BitUnixCsvParser`, `Bit2MeXlsxParser`, and `TangemCsvParser` MUST NOT exist
- **AND** `REGISTERED_PARSERS` and `ICsvIngestionPort` MUST NOT exist
- **AND** a repo-wide search MUST find no reference to any of them

#### Scenario: Deleting them changes no behaviour

- **WHEN** the deletion is applied
- **THEN** the frontend suite MUST pass with only the deleted files' own tests removed
- **AND** no remaining test MUST need a substitute parser

#### Scenario: The `WALLET_ACTIVATION` producer is named correctly afterwards

- **WHEN** the deleted `TangemCsvParser` is removed
- **THEN** every comment or document naming it as the producer of `WALLET_ACTIVATION` MUST be corrected
- **AND** the ingestion path that maps the real `tangem_activacion_xrp.csv` row MUST be the single named producer of that flag
