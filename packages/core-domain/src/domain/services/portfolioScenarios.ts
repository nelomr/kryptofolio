import { isConvertible, isStablecoinSymbol, type ConvertedAmount } from "@kryptofolio/shared-types";
import { Money } from "../../value-objects/Money";
import { rankHoldingsByValue } from "./holdingRanking";

/** `currentValue` is the holding's resolved value; `undefined` means no price or no convertible cost basis, never zero. */
export interface ScenarioHolding {
  symbol: string;
  quantity: string;
  currentValue?: string;
  costBasisFiat: string;
  costBasis: ConvertedAmount;
}

const ZERO = new Money("0");
const HUNDRED = new Money("100");

export type PositionValueOutcome =
  | {
      kind: "computed";
      symbol: string;
      positionValue: string;
      deltaVsCurrent: string;
      impliedAllocationPct: string;
    }
  | { kind: "not_held"; symbol: string }
  | { kind: "unvalued"; symbol: string; positionValue: string }
  | { kind: "empty_portfolio"; symbol: string };

function totalValued(holdings: readonly ScenarioHolding[]): Money {
  return holdings.reduce(
    (sum, holding) => (holding.currentValue === undefined ? sum : sum.add(new Money(holding.currentValue))),
    ZERO,
  );
}

/** Quantity always comes from the ledger; only the price is hypothetical. */
export function positionValueAt(
  holdings: readonly ScenarioHolding[],
  symbol: string,
  hypotheticalPrice: string,
): PositionValueOutcome {
  const holding = holdings.find((candidate) => candidate.symbol === symbol);
  if (holding === undefined) return { kind: "not_held", symbol };

  const positionValue = new Money(holding.quantity).mul(new Money(hypotheticalPrice));
  if (holding.currentValue === undefined) {
    return { kind: "unvalued", symbol, positionValue: positionValue.toFixed() };
  }

  const current = new Money(holding.currentValue);
  const denominator = totalValued(holdings).sub(current).add(positionValue);
  if (denominator.isZero()) return { kind: "empty_portfolio", symbol };

  return {
    kind: "computed",
    symbol,
    positionValue: positionValue.toFixed(),
    deltaVsCurrent: positionValue.sub(current).toFixed(),
    impliedAllocationPct: positionValue.div(denominator).mul(HUNDRED).toFixed(),
  };
}

export type BreakevenOutcome =
  | { kind: "computed"; symbol: string; avgUnitCost: string }
  | { kind: "not_held"; symbol: string }
  | { kind: "unconvertible_cost_basis"; symbol: string }
  | { kind: "zero_quantity"; symbol: string };

/** Average unit cost: the cost basis the ledger holds divided by the quantity it holds. */
export function breakevenPrice(holdings: readonly ScenarioHolding[], symbol: string): BreakevenOutcome {
  const holding = holdings.find((candidate) => candidate.symbol === symbol);
  if (holding === undefined) return { kind: "not_held", symbol };
  if (!isConvertible(holding.costBasis)) return { kind: "unconvertible_cost_basis", symbol };

  const quantity = new Money(holding.quantity);
  if (quantity.isZero()) return { kind: "zero_quantity", symbol };

  return { kind: "computed", symbol, avgUnitCost: new Money(holding.costBasisFiat).div(quantity).toFixed() };
}

export type ShockInput =
  | { kind: "uniform"; pct: string }
  | { kind: "per_asset"; shocks: ReadonlyArray<{ symbol: string; pct: string }> };

export type ShockOutcome =
  | {
      kind: "computed";
      assets: Array<{ symbol: string; before: string; after: string }>;
      totalBefore: string;
      totalAfter: string;
      delta: string;
      unvaluedSymbols: string[];
      notHeld: string[];
    }
  | { kind: "empty_portfolio" };

const PERCENT_SCALE = new Money("0.01");

/** Multiplies by (100 + pct) / 100 written as a multiplication by 0.01, so no division by a variable occurs. */
function shockedValue(value: Money, pct: string): Money {
  return value.mul(HUNDRED.add(new Money(pct)).mul(PERCENT_SCALE));
}

/**
 * A percentage is applied only to holdings that have a value. An unvalued holding is reported, not
 * shocked as if it were worth zero, and in a per-asset shock an asset the caller did not list is
 * held where it is.
 */
export function applyShock(holdings: readonly ScenarioHolding[], shock: ShockInput): ShockOutcome {
  const { ranked, unvalued } = rankHoldingsByValue(holdings, (h) => h.currentValue, holdings.length);
  if (ranked.length === 0) return { kind: "empty_portfolio" };

  const pctBySymbol = new Map<string, string>(
    shock.kind === "per_asset" ? shock.shocks.map((entry) => [entry.symbol, entry.pct]) : [],
  );

  let totalBefore = ZERO;
  let totalAfter = ZERO;
  const assets = ranked.map((holding) => {
    const before = new Money(holding.currentValue ?? "0");
    const pct = shock.kind === "uniform" ? shock.pct : (pctBySymbol.get(holding.symbol) ?? "0");
    const after = shockedValue(before, pct);
    totalBefore = totalBefore.add(before);
    totalAfter = totalAfter.add(after);
    return { symbol: holding.symbol, before: before.toFixed(), after: after.toFixed() };
  });

  const heldSymbols = new Set(holdings.map((h) => h.symbol));
  return {
    kind: "computed",
    assets,
    totalBefore: totalBefore.toFixed(),
    totalAfter: totalAfter.toFixed(),
    delta: totalAfter.sub(totalBefore).toFixed(),
    unvaluedSymbols: unvalued.map((h) => h.symbol),
    notHeld: shock.kind === "per_asset" ? shock.shocks.map((e) => e.symbol).filter((symbol) => !heldSymbols.has(symbol)) : [],
  };
}

export type ConcentrationBlock =
  | { kind: "computed"; top1Weight: string; top3Weight: string; hhi: string; effectiveHoldings: string }
  | { kind: "empty" };

export interface ConcentrationOutcome {
  /** Every valued holding, stablecoins included. */
  all: ConcentrationBlock;
  /** Weights renormalised over the non-stablecoin holdings. */
  excludingStablecoins: ConcentrationBlock;
  /** The stablecoin share of the valued total; `null` when nothing is valued, where a share has no meaning. */
  stablecoinWeight: string | null;
  unvaluedCount: number;
}

const ONE = new Money("1");

function blockOf(holdings: readonly ScenarioHolding[]): ConcentrationBlock {
  const total = totalValued(holdings);
  if (total.isZero()) return { kind: "empty" };

  const weightOf = (holding: ScenarioHolding): Money => new Money(holding.currentValue ?? "0").div(total);
  const { ranked } = rankHoldingsByValue(holdings, (h) => h.currentValue, 3);
  const hhi = holdings.reduce((sum, holding) => sum.add(weightOf(holding).mul(weightOf(holding))), ZERO);
  if (hhi.isZero()) return { kind: "empty" };

  return {
    kind: "computed",
    top1Weight: ranked.slice(0, 1).reduce((sum, h) => sum.add(weightOf(h)), ZERO).toFixed(),
    top3Weight: ranked.reduce((sum, h) => sum.add(weightOf(h)), ZERO).toFixed(),
    hhi: hhi.toFixed(),
    effectiveHoldings: ONE.div(hhi).toFixed(),
  };
}

/**
 * Concentration over valued holdings only: an unvalued holding is counted, never weighted as zero.
 * Stablecoins are reported separately so a mostly-cash portfolio is neither flagged as concentrated
 * nor hidden as diversified; the closed `STABLECOIN_SYMBOLS` list decides, and an unlisted symbol
 * counts as risky.
 */
export function concentrationOf(holdings: readonly ScenarioHolding[]): ConcentrationOutcome {
  const valued = holdings.filter((holding) => holding.currentValue !== undefined);
  const nonStable = valued.filter((holding) => !isStablecoinSymbol(holding.symbol));
  const total = totalValued(valued);

  const stablecoinTotal = totalValued(valued.filter((holding) => isStablecoinSymbol(holding.symbol)));
  return {
    all: blockOf(valued),
    excludingStablecoins: blockOf(nonStable),
    stablecoinWeight: total.isZero() ? null : stablecoinTotal.div(total).toFixed(),
    unvaluedCount: holdings.length - valued.length,
  };
}
