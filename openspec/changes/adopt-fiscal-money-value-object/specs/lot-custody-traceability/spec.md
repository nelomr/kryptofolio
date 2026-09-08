## ADDED Requirements

### Requirement: Lot, Disposal and Relocation Quantities Cross the Wire As Exact Decimals

The token-history response — the surface through which this capability's lots, disposal events and custody relocations reach a client — SHALL carry every quantity and every cost figure as an exact decimal string, never as a JSON number. `GetTokenHistoryUseCase`'s wire DTOs SHALL declare `original_qty`, `remaining_qty`, `unit_cost` and `total_cost` on the lot, `amount_from_lot` on the disposal event, `qty` on the relocation, and `qty` on the custody entry as string carriers, and the use case SHALL emit each of them by passing the source value through unchanged.

Every one of those seven sources is already exact: the four lot figures are `PreciseAmount` on `ILedgerPort`'s tax-lot row, and `amount_from_lot`, the relocation `qty` and the custody `qty` are `string` on `ITaxCalculatorPort`'s converted-disposal, relocation and custody-location rows. The `Number(...)` wrapper applied to them is therefore gratuitous destruction of precision, not a conversion any consumer needs. The correction SHALL be the deletion of that wrapper and the widening of the declared field type; it SHALL NOT introduce any parsing, formatting, or reconstruction of a value from a float.

Where the brand already exists at the source it SHALL be carried, and where it does not it SHALL NOT be manufactured: the four lot fields SHALL be declared `PreciseAmount`, and the three fields arriving as plain `string` SHALL be declared `string`, rather than re-validating a value the analytical view already produced.

#### Scenario: The seven token-history figures are strings on the wire

- **WHEN** the token-history response DTO types are inspected
- **THEN** `original_qty`, `remaining_qty`, `unit_cost` and `total_cost` SHALL be `PreciseAmount`
- **AND** `amount_from_lot`, the relocation `qty` and the custody `qty` SHALL be `string`
- **AND** none of the seven SHALL be typed `number`
- **AND** no `Number(...)`, `parseFloat(...)` or unary `+` SHALL be applied to any of them on the emitting path.

#### Scenario: A figure with more significant digits than a double preserves reaches the client intact

- **WHEN** a tax lot's `unit_cost_fiat` is the exact decimal `0.000000010000000001` and the token history is requested
- **THEN** the emitted `unit_cost` SHALL be that same string, digit for digit
- **AND** it SHALL NOT be the nearest IEEE-754 double's decimal expansion
- **AND** the source's own formatting SHALL survive the passthrough, so a stored `500.00` SHALL be emitted as `"500.00"` rather than normalised.

#### Scenario: The zero-quantity custody filter compares exactly

- **WHEN** the custody rows are grouped by lot and a row whose net holding is zero must be excluded, because an account holding none of a lot is not a location
- **THEN** the predicate SHALL be an exact decimal comparison of the row's `qty` against `'0'`, via `compareDecimalStrings`
- **AND** it SHALL NOT be `Number(row.qty) === 0`, which underflows a real, tiny holding such as `1e-400` to zero and would filter it out of existence
- **AND** a custody row of quantity `0.000000000000000000001` SHALL be retained as a location
- **AND** a custody row of quantity `0` SHALL still be excluded.

#### Scenario: No other quantity predicate is introduced or left behind

- **WHEN** the token-history use case is inspected after the change
- **THEN** the custody zero filter SHALL be the only place a quantity governs whether a row is emitted
- **AND** lots and disposal events SHALL remain unfiltered by quantity, the remaining predicates in that file being identifier-presence and set-membership checks
- **AND** no `Number(...)` on a monetary or quantity value SHALL remain anywhere in the file, including inside a boolean-only use, so that a future reader cannot mistake a confined float use for the defect this requirement removes.

#### Scenario: The shape change needs no coordinated client release

- **WHEN** the widened response is parsed by the existing frontend DTO layer, whose numeric field helper already accepts either a JSON number or a numeric string
- **THEN** the parse SHALL succeed and produce the same entities it produced before the change
- **AND** the emitter change SHALL therefore be landable on its own, ahead of any client change, with no breakage window.
