import { describe, it, expect } from "vitest";
import type { ConvertedAmount } from "@kryptofolio/shared-types";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Money } from "../value-objects/Money";
import { applyShock, concentrationOf, breakevenPrice, positionValueAt, type ScenarioHolding } from "../domain/services/portfolioScenarios";

const native = (amount: string): ConvertedAmount => ({ kind: "NATIVE", amount, currency: "EUR" });
const unconvertible: ConvertedAmount = {
  kind: "UNCONVERTIBLE",
  nativeAmount: "10",
  nativeCurrency: "USD",
  requested: "EUR",
};

function holding(
  symbol: string,
  quantity: string,
  currentValue: string | undefined,
  costBasisFiat = "0",
  costBasis: ConvertedAmount = native(costBasisFiat),
): ScenarioHolding {
  return { symbol, quantity, currentValue, costBasisFiat, costBasis };
}

describe("positionValueAt", () => {
  const portfolio = [holding("BTC", "2", "100000"), holding("ETH", "10", "100000")];

  it("multiplies the ledger quantity by the hypothetical price and reports delta and implied allocation", () => {
    const result = positionValueAt(portfolio, "BTC", "70000");

    expect(result).toEqual({
      kind: "computed",
      symbol: "BTC",
      positionValue: "140000",
      deltaVsCurrent: "40000",
      impliedAllocationPct: new Money("140000").div(new Money("240000")).mul(new Money("100")).toFixed(),
    });
  });

  it("gives an exact allocation when the ratio is exact", () => {
    const result = positionValueAt(portfolio, "BTC", "75000");

    expect(result).toMatchObject({ kind: "computed", positionValue: "150000", impliedAllocationPct: "60" });
  });

  it("reports a symbol that is not held without any figure", () => {
    expect(positionValueAt(portfolio, "XYZ", "1")).toEqual({ kind: "not_held", symbol: "XYZ" });
  });

  it("still returns the position value when the holding has no current value, and omits delta and allocation", () => {
    const result = positionValueAt([holding("BTC", "2", undefined), holding("ETH", "10", "100")], "BTC", "5");

    expect(result).toEqual({ kind: "unvalued", symbol: "BTC", positionValue: "10" });
    expect(result).not.toHaveProperty("deltaVsCurrent");
    expect(result).not.toHaveProperty("impliedAllocationPct");
  });

  it("is empty_portfolio when the allocation denominator is zero, without dividing", () => {
    const result = positionValueAt([holding("BTC", "2", "100")], "BTC", "0");

    expect(result).toEqual({ kind: "empty_portfolio", symbol: "BTC" });
  });

  it("computes a zero hypothetical price instead of rejecting it", () => {
    const result = positionValueAt(portfolio, "BTC", "0");

    expect(result).toMatchObject({ kind: "computed", positionValue: "0", deltaVsCurrent: "-100000", impliedAllocationPct: "0" });
  });

  it("excludes unvalued holdings from the total equity", () => {
    const result = positionValueAt([holding("BTC", "1", "100"), holding("ETH", "1", undefined)], "BTC", "300");

    expect(result).toMatchObject({ kind: "computed", impliedAllocationPct: "100" });
  });
});

describe("breakevenPrice", () => {
  it("is the cost basis divided by the quantity", () => {
    expect(breakevenPrice([holding("BTC", "2", "100", "30000")], "BTC")).toEqual({
      kind: "computed",
      symbol: "BTC",
      avgUnitCost: "15000",
    });
  });

  it("reports a symbol that is not held", () => {
    expect(breakevenPrice([holding("BTC", "2", "100", "30000")], "XYZ")).toEqual({ kind: "not_held", symbol: "XYZ" });
  });

  it("never treats an unconvertible cost basis as zero", () => {
    const result = breakevenPrice([holding("BTC", "2", "100", "0", unconvertible)], "BTC");

    expect(result).toEqual({ kind: "unconvertible_cost_basis", symbol: "BTC" });
    expect(result).not.toHaveProperty("avgUnitCost");
  });

  it("is zero_quantity for an empty position, without dividing", () => {
    expect(breakevenPrice([holding("BTC", "0", undefined, "30000")], "BTC")).toEqual({
      kind: "zero_quantity",
      symbol: "BTC",
    });
  });

  it("keeps decimals beyond float precision", () => {
    const result = breakevenPrice([holding("BTC", "4", "1", "12345678901234567890.000000000000000004")], "BTC");

    expect(result).toMatchObject({ avgUnitCost: "3086419725308641972.500000000000000001" });
  });
});

describe("applyShock", () => {
  const two = [holding("BTC", "1", "100"), holding("ETH", "1", "300")];

  it("applies one percentage to every valued holding", () => {
    const result = applyShock(two, { kind: "uniform", pct: "-50" });

    expect(result).toEqual({
      kind: "computed",
      assets: [
        { symbol: "ETH", before: "300", after: "150" },
        { symbol: "BTC", before: "100", after: "50" },
      ],
      totalBefore: "400",
      totalAfter: "200",
      delta: "-200",
      unvaluedSymbols: [],
      notHeld: [],
    });
  });

  it("holds an unlisted asset at zero percent in a per-asset shock", () => {
    const result = applyShock(two, { kind: "per_asset", shocks: [{ symbol: "BTC", pct: "10" }] });

    if (result.kind !== "computed") throw new Error("expected computed");
    expect(result.assets.find((a) => a.symbol === "BTC")).toEqual({ symbol: "BTC", before: "100", after: "110" });
    expect(result.assets.find((a) => a.symbol === "ETH")).toEqual({ symbol: "ETH", before: "300", after: "300" });
    expect(result.totalAfter).toBe("410");
    expect(result.delta).toBe("10");
  });

  it("returns an unknown symbol in notHeld and still computes the remaining shocks", () => {
    const result = applyShock(two, {
      kind: "per_asset",
      shocks: [
        { symbol: "XYZ", pct: "5" },
        { symbol: "ETH", pct: "-10" },
      ],
    });

    if (result.kind !== "computed") throw new Error("expected computed");
    expect(result.notHeld).toEqual(["XYZ"]);
    expect(result.totalAfter).toBe("370");
  });

  it("excludes an unvalued holding from the totals and lists it, never shocking it as zero", () => {
    const result = applyShock([...two, holding("ADA", "5", undefined)], { kind: "uniform", pct: "100" });

    if (result.kind !== "computed") throw new Error("expected computed");
    expect(result.unvaluedSymbols).toEqual(["ADA"]);
    expect(result.assets.map((a) => a.symbol)).not.toContain("ADA");
    expect(result.totalBefore).toBe("400");
    expect(result.totalAfter).toBe("800");
  });

  it("is empty_portfolio when nothing is valued", () => {
    expect(applyShock([], { kind: "uniform", pct: "10" })).toEqual({ kind: "empty_portfolio" });
    expect(applyShock([holding("ADA", "5", undefined)], { kind: "uniform", pct: "10" })).toEqual({
      kind: "empty_portfolio",
    });
  });

  it("takes a holding to zero at the minus one hundred boundary and multiplies at the upper boundary", () => {
    const down = applyShock(two, { kind: "uniform", pct: "-100" });
    const up = applyShock(two, { kind: "uniform", pct: "1000" });

    if (down.kind !== "computed" || up.kind !== "computed") throw new Error("expected computed");
    expect(down.totalAfter).toBe("0");
    expect(up.totalAfter).toBe("4400");
  });

  it("keeps decimal precision beyond float range", () => {
    const result = applyShock([holding("BTC", "1", "12345678901234567890.123456789")], { kind: "uniform", pct: "10" });

    if (result.kind !== "computed") throw new Error("expected computed");
    expect(result.assets[0]?.after).toBe("13580246791358024679.1358024679");
  });
});

describe("concentrationOf", () => {
  const weights = (values: Array<[string, string]>) => values.map(([symbol, value]) => holding(symbol, "1", value));

  function computed(block: ReturnType<typeof concentrationOf>["all"]) {
    if (block.kind !== "computed") throw new Error("expected a computed block");
    return block;
  }

  it("has an index of one and a single effective holding for a lone asset", () => {
    const result = concentrationOf(weights([["BTC", "500"]]));

    expect(computed(result.all)).toEqual({
      kind: "computed",
      top1Weight: "1",
      top3Weight: "1",
      hhi: "1",
      effectiveHoldings: "1",
    });
  });

  it("splits evenly across four equal holdings", () => {
    const block = computed(concentrationOf(weights([["A", "10"], ["B", "10"], ["C", "10"], ["D", "10"]])).all);

    expect(block).toMatchObject({ top1Weight: "0.25", top3Weight: "0.75", hhi: "0.25", effectiveHoldings: "4" });
  });

  it("sums the three largest weights for top3 and squares every weight for the index", () => {
    const block = computed(
      concentrationOf(weights([["A", "40"], ["B", "30"], ["C", "15"], ["D", "10"], ["E", "5"]])).all,
    );

    expect(block).toMatchObject({ top1Weight: "0.4", top3Weight: "0.85", hhi: "0.285" });
  });

  it("reports stablecoins in both views and renormalises the second", () => {
    const result = concentrationOf(weights([["USDC", "900"], ["BTC", "100"]]));

    expect(result.stablecoinWeight).toBe("0.9");
    expect(computed(result.all).top1Weight).toBe("0.9");
    expect(computed(result.excludingStablecoins)).toMatchObject({ top1Weight: "1", hhi: "1" });
  });

  it("types the excluded view as empty when every valued holding is a stablecoin", () => {
    const result = concentrationOf(weights([["USDC", "50"], ["USDT", "50"]]));

    expect(result.excludingStablecoins).toEqual({ kind: "empty" });
    expect(computed(result.all).top1Weight).toBe("0.5");
    expect(result.stablecoinWeight).toBe("1");
  });

  it("returns empty blocks and no stablecoin weight, without throwing, when nothing is valued", () => {
    const result = concentrationOf([holding("ADA", "5", undefined)]);

    expect(result).toEqual({
      all: { kind: "empty" },
      excludingStablecoins: { kind: "empty" },
      stablecoinWeight: null,
      unvaluedCount: 1,
    });
    expect(concentrationOf([]).all).toEqual({ kind: "empty" });
  });

  it("has a null stablecoin weight and two empty blocks when none of the holdings is valued", () => {
    const result = concentrationOf([holding("USDC", "10", undefined), holding("BTC", "1", undefined)]);

    expect(result.stablecoinWeight).toBeNull();
    expect(result.all).toEqual({ kind: "empty" });
    expect(result.excludingStablecoins).toEqual({ kind: "empty" });
    expect(result.unvaluedCount).toBe(2);
  });

  it("is empty, not NaN or a throw, when holdings are valued but worth zero in total", () => {
    const result = concentrationOf(weights([["A", "0"], ["USDC", "0"]]));

    expect(result.all).toEqual({ kind: "empty" });
    expect(result.excludingStablecoins).toEqual({ kind: "empty" });
    expect(result.stablecoinWeight).toBeNull();
  });

  it("counts an unvalued holding and never weights it as zero", () => {
    const result = concentrationOf([...weights([["A", "30"], ["B", "10"]]), holding("ADA", "5", undefined)]);

    expect(result.unvaluedCount).toBe(1);
    expect(computed(result.all)).toMatchObject({ top1Weight: "0.75", hhi: "0.625" });
  });

  it("treats an unlisted symbol as a risky asset that counts toward concentration", () => {
    const result = concentrationOf(weights([["FAKECOIN", "100"], ["USDC", "100"]]));

    expect(computed(result.excludingStablecoins)).toMatchObject({ top1Weight: "1" });
    expect(result.stablecoinWeight).toBe("0.5");
  });

  it("keeps precision beyond float range", () => {
    const block = computed(
      concentrationOf(weights([["A", "12345678901234567890.1"], ["B", "12345678901234567890.1"]])).all,
    );

    expect(block).toMatchObject({ top1Weight: "0.5", hhi: "0.5", effectiveHoldings: "2" });
  });
});

describe("positionValueAt precision", () => {
  it("returns the exact decimal product when it has more digits than a float holds", () => {
    const result = positionValueAt([holding("BTC", "123456789.123456789", "1")], "BTC", "987654321.987654321");

    expect(result).toMatchObject({ kind: "computed", positionValue: "121932631356500531.347203169112635269" });
  });
});

describe("portfolioScenarios.ts purity", () => {
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../domain/services/portfolioScenarios.ts"),
    "utf-8",
  );
  const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);

  it("imports only Money, shared-types and sibling pure modules", () => {
    expect(specifiers.sort()).toEqual(["../../value-objects/Money", "./holdingRanking", "@kryptofolio/shared-types"].sort());
  });

  it("never imports decimal.js or an I/O module directly", () => {
    expect(source).not.toMatch(/decimal\.js|node:|fetch\(|better-sqlite|duckdb/i);
  });
});
