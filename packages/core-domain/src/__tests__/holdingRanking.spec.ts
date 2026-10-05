import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { rankByAbsoluteValue, rankHoldingsByValue } from "../domain/services/holdingRanking";

type Holding = { id: string; value: string | undefined };

describe("rankHoldingsByValue", () => {
  function holding(id: string, value: string | undefined): Holding {
    return { id, value };
  }

  it("ranks valued holdings descending by exact decimal value, capped at topN", () => {
    const holdings = [
      holding("a", "10.5"),
      holding("b", "100.25"),
      holding("c", "1.000000000000000001"),
      holding("d", "1.000000000000000002"),
    ];

    const { ranked } = rankHoldingsByValue(holdings, (h) => h.value, 3);

    expect(ranked.map((h) => h.id)).toEqual(["b", "a", "d", "c"].slice(0, 3));
    expect(ranked).toHaveLength(3);
  });

  it("counts only valued holdings that missed the cut in omittedCount", () => {
    const holdings = [holding("a", "1"), holding("b", "2"), holding("c", "3")];

    const { omittedCount } = rankHoldingsByValue(holdings, (h) => h.value, 2);

    expect(omittedCount).toBe(1);
  });

  it("routes a holding with an undefined value to unvalued, never into ranked, and never compares it as '0'", () => {
    const holdings = [holding("a", "5"), holding("b", undefined), holding("c", "-1")];

    const { ranked, unvalued, omittedCount } = rankHoldingsByValue(holdings, (h) => h.value, 10);

    expect(ranked.map((h) => h.id)).toEqual(["a", "c"]);
    expect(unvalued.map((h) => h.id)).toEqual(["b"]);
    expect(omittedCount).toBe(0);
  });

  it("does not import decimal.js directly and compares only through Money", () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(dirname, "../domain/services/holdingRanking.ts"),
      "utf-8",
    );

    expect(source).not.toMatch(/from\s+["']decimal\.js["']/);
    expect(source).toMatch(/from\s+["'](\.\.\/)*value-objects\/Money["']/);
  });
});

describe("rankByAbsoluteValue", () => {
  type Row = { id: string; value: string };

  it("ranks by magnitude regardless of sign, capped at topN, counting what missed the cut", () => {
    const rows: Row[] = [
      { id: "small-gain", value: "10" },
      { id: "big-loss", value: "-500.5" },
      { id: "mid-gain", value: "300" },
      { id: "tiny-loss", value: "-1" },
    ];

    const { ranked, omittedCount } = rankByAbsoluteValue(rows, (r) => r.value, 2);

    expect(ranked.map((r) => r.id)).toEqual(["big-loss", "mid-gain"]);
    expect(omittedCount).toBe(2);
  });

  it("compares exact decimals, not floats", () => {
    const rows: Row[] = [
      { id: "a", value: "-1.000000000000000001" },
      { id: "b", value: "1.000000000000000002" },
    ];

    expect(rankByAbsoluteValue(rows, (r) => r.value, 2).ranked.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps the input order for equal magnitudes", () => {
    const rows: Row[] = [
      { id: "first", value: "-5" },
      { id: "second", value: "5" },
    ];

    expect(rankByAbsoluteValue(rows, (r) => r.value, 2).ranked.map((r) => r.id)).toEqual(["first", "second"]);
  });
});
