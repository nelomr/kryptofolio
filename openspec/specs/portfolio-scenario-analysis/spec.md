# portfolio-scenario-analysis Specification

## Purpose
TBD - created by archiving change add-ai-advisor-read-and-scenario-tools. Update Purpose after archive.
## Requirements
### Requirement: Scenario Arithmetic Lives In Pure Core-Domain Functions Over Money
`packages/core-domain/src/domain/services/portfolioScenarios.ts` SHALL expose `positionValueAt`, `breakevenPrice`, `applyShock`, and `concentrationOf`. Their inputs and outputs SHALL be `PreciseAmount` strings, every arithmetic step SHALL go through `Money` (`mul`, `div`, `add`, `sub`), and they SHALL perform no I/O. Every `div` SHALL be preceded by an `isZero` check on the divisor that returns a typed outcome arm, so a division by zero is never thrown and never produces `Infinity` or `NaN`.

#### Scenario: Division by a zero divisor returns a typed arm
- **WHEN** any of the four functions is called with an input whose divisor (quantity, valued total, or total after the hypothetical price) is zero
- **THEN** it returns that scenario's typed non-`computed` arm and does not throw

#### Scenario: Precision beyond float range is preserved
- **WHEN** `positionValueAt` is called with a quantity and a unit price whose exact product has more significant digits than a float holds
- **THEN** the returned `positionValue` is the exact decimal product, as a `PreciseAmount` string

#### Scenario: The functions import no I/O and no raw decimal library
- **WHEN** `portfolioScenarios.ts` is inspected
- **THEN** it imports only `Money`, `PreciseAmount` types, and sibling pure modules, with no port, no database driver, and no direct `decimal.js` import

### Requirement: Scenario Inputs Are Validated Before Any Computation
A hypothetical unit price SHALL be parsed with `scenarioPriceSchema`, which is `preciseAmountSchema` refined to reject negative values; zero SHALL be accepted. The `per_asset` shock entry count SHALL be bounded to 1 to 25 by the input schema (`MAX_SHOCK_ENTRIES`), not by the pure function. A percentage SHALL be parsed with `preciseAmountSchema` and bounded to the closed range -100 to 1000. A symbol SHALL be matched exactly after upper-casing. Quantity, cost basis, and current value SHALL always come from the ledger read and SHALL NOT be accepted as model input.

#### Scenario: A percentage below -100 is rejected
- **WHEN** a scenario is requested with a percentage of `-100.01`
- **THEN** input validation rejects it and no use case is invoked

#### Scenario: A percentage above 1000 is rejected
- **WHEN** a scenario is requested with a percentage of `1000.01`
- **THEN** input validation rejects it and no use case is invoked

#### Scenario: The boundary percentages are accepted
- **WHEN** a scenario is requested with a percentage of `-100` or of `1000`
- **THEN** input validation accepts it and the scenario is computed

#### Scenario: A malformed hypothetical price is rejected
- **WHEN** a scenario is requested with a unit price that `preciseAmountSchema` rejects
- **THEN** input validation rejects it and no use case is invoked

#### Scenario: A negative hypothetical price is rejected
- **WHEN** a scenario is requested with a unit price of `-1`
- **THEN** input validation rejects it and no use case is invoked

#### Scenario: Quantity cannot be supplied by the caller
- **WHEN** a scenario request carries a `quantity`, `costBasis`, or `currentValue` field
- **THEN** the strict input schema rejects it

### Requirement: Scenario Use Case Is A Functional Sandwich Over The Portfolio Summary
`GetPortfolioScenarioUseCase`, in `apps/backend/src/core/application/use-cases/`, SHALL read `GetPortfolioSummaryUseCase` (all accounts, base currency, live prices, no top-N cap), apply the matching pure function, and return the result, with one method per scenario. It SHALL contain no arithmetic of its own. Figures SHALL be expressed in the base currency of the request, and every outcome, `computed` or not, SHALL carry a `currency` field naming it; every non-`computed` arm of a per-symbol scenario SHALL also carry `symbol`. A holding SHALL be valued only when its current value is present and its cost basis is convertible, the same predicate `portfolio_summary` applies; the use case SHALL apply this predicate itself because the application layer may not import from the AI subtree.

#### Scenario: Holdings are read once and uncapped
- **WHEN** a scenario method runs against a portfolio with more holdings than `topNHoldings`
- **THEN** the pure function receives every holding, not only the top N

#### Scenario: The use case does no arithmetic
- **WHEN** `GetPortfolioScenarioUseCase` is inspected
- **THEN** it imports no `Money` operation other than passing values to the pure functions, and no `decimal.js`

#### Scenario: Base currency comes from request context
- **WHEN** a scenario runs for a request whose base currency is not EUR
- **THEN** the summary is read in that base currency and the result's figures are in that currency

### Requirement: Position Value At A Hypothetical Price
`positionValueAt` SHALL accept a symbol and a hypothetical unit price and return exactly one of: `computed` (`positionValue`, `deltaVsCurrent`, `impliedAllocationPct` as a `PreciseAmount` string, never a number), `not_held`, `unvalued`, or `empty_portfolio`. `positionValue` SHALL be the ledger quantity multiplied by the hypothetical price. `deltaVsCurrent` SHALL be `positionValue` minus the holding's current value. `impliedAllocationPct` SHALL be `positionValue` divided by (total valued equity minus the current position value plus `positionValue`).

#### Scenario: Computed outcome
- **WHEN** the holding is `BTC` with quantity `2`, current value `100000`, total valued equity `200000`, and the hypothetical price is `70000`
- **THEN** the result is `computed` with `positionValue` `140000`, `deltaVsCurrent` `40000`, and `impliedAllocationPct` equal to 140000 divided by 240000 expressed as a percentage

#### Scenario: Symbol not held
- **WHEN** the symbol matches no holding in the ledger
- **THEN** the result is `not_held` carrying the symbol, and no figure

#### Scenario: Holding has no current value
- **WHEN** the symbol is held but has no resolved current value
- **THEN** the result is `unvalued`, it still carries `positionValue`, and it carries neither `deltaVsCurrent` nor `impliedAllocationPct`

#### Scenario: Allocation denominator is zero
- **WHEN** the implied-allocation denominator is zero
- **THEN** the result is `empty_portfolio` and no division is performed

#### Scenario: A zero hypothetical price is computed, not rejected
- **WHEN** the hypothetical unit price is `0` and the portfolio has other valued holdings
- **THEN** the result is `computed` with `positionValue` `0` and a negative `deltaVsCurrent`

### Requirement: Breakeven Price Is The Average Unit Cost
`breakevenPrice` SHALL accept a symbol and return exactly one of: `computed` (`avgUnitCost`, being cost basis divided by quantity), `not_held`, `unconvertible_cost_basis`, or `zero_quantity`. `unconvertible_cost_basis` SHALL be returned when `isConvertible(cost_basis)` is false for the holding. The quantity-is-zero check SHALL precede the division.

#### Scenario: Computed outcome
- **WHEN** the holding has convertible cost basis `30000` and quantity `2`
- **THEN** the result is `computed` with `avgUnitCost` `15000`

#### Scenario: Symbol not held
- **WHEN** the symbol matches no holding
- **THEN** the result is `not_held` carrying the symbol

#### Scenario: Cost basis cannot be converted
- **WHEN** the holding's cost basis is `UNCONVERTIBLE`
- **THEN** the result is `unconvertible_cost_basis`, no `avgUnitCost` is present, and the cost basis is never treated as `0`

#### Scenario: Zero quantity
- **WHEN** the holding's quantity is zero
- **THEN** the result is `zero_quantity` and no division is performed

### Requirement: Portfolio Shock Applies A Uniform Or Per-Asset Percentage
`applyShock` SHALL accept an input that is a union `{ kind: 'uniform', pct }` or `{ kind: 'per_asset', shocks: [{ symbol, pct }] }` (the 1 to 25 entry bound is enforced upstream by the input schema), and return exactly one of: `computed` (per-asset shocked values, `totalBefore`, `totalAfter`, `delta`, `unvaluedSymbols`) or `empty_portfolio`. In `per_asset`, a held asset not listed SHALL be held at 0%, and a listed symbol that is not held SHALL be returned in `notHeld`. Unvalued holdings SHALL be excluded from the totals and listed in `unvaluedSymbols`, never shocked as zero.

#### Scenario: Uniform shock
- **WHEN** two valued holdings worth `100` and `300` receive a uniform shock of `-50`
- **THEN** the result is `computed` with shocked values `50` and `150`, `totalBefore` `400`, `totalAfter` `200`, and `delta` `-200`

#### Scenario: Per-asset shock leaves unlisted assets unchanged
- **WHEN** a `per_asset` shock lists only `BTC` at `+10` and the portfolio also holds `ETH`
- **THEN** `ETH` appears with its shocked value equal to its current value

#### Scenario: Unknown symbol in a per-asset shock
- **WHEN** a `per_asset` shock lists `XYZ` and `XYZ` is not held
- **THEN** `XYZ` is returned in `notHeld`, and the remaining shocks are still computed

#### Scenario: Unvalued holding is excluded and listed
- **WHEN** a holding has no current value
- **THEN** its symbol is in `unvaluedSymbols` and it contributes to neither `totalBefore` nor `totalAfter`

#### Scenario: No valued holdings
- **WHEN** the portfolio has no valued holding
- **THEN** the result is `empty_portfolio`

#### Scenario: Shock entry count is bounded
- **WHEN** a `per_asset` shock carries 0 or 26 entries
- **THEN** input validation rejects it

### Requirement: Concentration Reports Weights And HHI With Stablecoins Reported Separately
`concentrationOf` SHALL compute over valued holdings only, so an unvalued holding is excluded and counted, never weighted as zero. The weight of holding i SHALL be its value divided by the total valued value. `top1Weight` and `top3Weight` SHALL be the largest weight and the sum of the three largest, ranked through `rankHoldingsByValue`. HHI SHALL be the sum of squared weights on a 0 to 1 scale, returned as a `PreciseAmount` string, with `effectiveHoldings` equal to 1 divided by HHI. The result SHALL carry an `all` block (stablecoins included), an `excludingStablecoins` block (weights renormalised over non-stable holdings), and `stablecoinWeight` (the stablecoin share of the total as a `PreciseAmount` string, or `null` when no holding is valued, never `'0'`, so an undefined share is not read as zero). Each block SHALL be `{ kind: 'computed', ... }` or `{ kind: 'empty' }` when its valued total is zero. A symbol SHALL be a stablecoin only if it is in `STABLECOIN_SYMBOLS` in shared-types (`USDT`, `USDC`, `DAI`, `EURC`, `FDUSD`, `PYUSD`, `TUSD`, `USDE`).

#### Scenario: Stablecoin weight is null when nothing is valued
- **WHEN** `concentrationOf` runs over holdings none of which is valued
- **THEN** `stablecoinWeight` is `null`, not `'0'`, and both blocks are `empty`

#### Scenario: HHI on a single holding
- **WHEN** the only valued holding is `BTC`
- **THEN** the `all` block is `computed` with `top1Weight` `1`, HHI `1`, and `effectiveHoldings` `1`

#### Scenario: HHI on an equal split
- **WHEN** four valued holdings have equal value
- **THEN** each weight is `0.25`, HHI is `0.25`, and `effectiveHoldings` is `4`

#### Scenario: Top-3 weight
- **WHEN** five valued holdings have weights `0.4`, `0.3`, `0.15`, `0.1`, and `0.05`
- **THEN** `top1Weight` is `0.4` and `top3Weight` is `0.85`

#### Scenario: Stablecoins are reported in both views
- **WHEN** the portfolio holds `USDC` worth `900` and `BTC` worth `100`
- **THEN** `stablecoinWeight` is `0.9`, the `all` block has `top1Weight` `0.9`, and the `excludingStablecoins` block has `top1Weight` `1`

#### Scenario: Portfolio of only stablecoins
- **WHEN** every valued holding is a stablecoin
- **THEN** the `excludingStablecoins` block is `{ kind: 'empty' }` and the `all` block is `computed`

#### Scenario: Zero valued total is typed, not thrown
- **WHEN** no holding is valued
- **THEN** both blocks are `{ kind: 'empty' }` and no division is performed

#### Scenario: Unvalued holdings are counted, not weighted as zero
- **WHEN** a holding has no current value
- **THEN** it is absent from every weight and from HHI, and is counted in the result's unvalued count

#### Scenario: An unlisted symbol is not a stablecoin
- **WHEN** a holding's symbol is not in `STABLECOIN_SYMBOLS`
- **THEN** it is counted in the `excludingStablecoins` block

#### Scenario: The stablecoin list is display classification only
- **WHEN** the repository is searched for readers of `STABLECOIN_SYMBOLS`
- **THEN** no tax, FIFO, or custody code reads it

