import { describe, it, expect } from "vitest";
import { compareTaxSummaries, type TaxYearFigures } from "../domain/services/compareTaxSummaries";

function year(overrides: Partial<TaxYearFigures["summary"]> = {}, rest: Partial<Omit<TaxYearFigures, "summary">> = {}): TaxYearFigures {
  return {
    summary: {
      capital_gains: "100",
      capital_losses: "40",
      savings_base_yields: "10",
      general_base_airdrops: "0",
      net_patrimonial_result: "60",
      estimated_irpf: "11.4",
      ...overrides,
    },
    unconvertibleCount: 0,
    excludedFlaggedEvents: 0,
    excludedUnresolvedIncomeCount: 0,
    ...rest,
  };
}

describe("compareTaxSummaries", () => {
  it("subtracts every summary field as B minus A", () => {
    const a = year();
    const b = year({ capital_gains: "250.5", capital_losses: "10", estimated_irpf: "5" });

    const { deltas } = compareTaxSummaries(a, b);

    expect(deltas.capital_gains).toEqual({ kind: "delta", value: "150.5" });
    expect(deltas.capital_losses).toEqual({ kind: "delta", value: "-30" });
    expect(deltas.estimated_irpf).toEqual({ kind: "delta", value: "-6.4" });
    expect(deltas.savings_base_yields).toEqual({ kind: "delta", value: "0" });
  });

  it("reports every delta as a plain delta when both years are complete", () => {
    const { deltas, yearA, yearB } = compareTaxSummaries(year(), year({ capital_gains: "1" }));

    expect(yearA.completeness).toEqual({ kind: "complete" });
    expect(yearB.completeness).toEqual({ kind: "complete" });
    for (const delta of Object.values(deltas)) expect(delta.kind).toBe("delta");
  });

  it("names why a year is incomplete, one reason per cause", () => {
    const incomplete = year({}, { unconvertibleCount: 2, excludedFlaggedEvents: 1, excludedUnresolvedIncomeCount: 3 });

    const { yearA } = compareTaxSummaries(incomplete, year());

    expect(yearA.completeness).toEqual({
      kind: "incomplete",
      reasons: ["unconvertible_events", "excluded_flagged_events", "excluded_unresolved_income"],
    });
    expect(yearA.unconvertibleCount).toBe(2);
    expect(yearA.excludedFlaggedEvents).toBe(1);
    expect(yearA.excludedUnresolvedIncomeCount).toBe(3);
  });

  it("marks every delta incomparable when either year is incomplete", () => {
    for (const [a, b] of [
      [year({}, { excludedFlaggedEvents: 1 }), year()],
      [year(), year({}, { unconvertibleCount: 1 })],
    ] as const) {
      const { deltas } = compareTaxSummaries(a, b);

      for (const delta of Object.values(deltas)) {
        expect(delta.kind).toBe("delta_incomparable");
        expect(delta).not.toHaveProperty("comparability");
      }
    }
  });

  it("keeps precision beyond float range", () => {
    const a = year({ capital_gains: "12345678901234567890.000000000000000001" });
    const b = year({ capital_gains: "12345678901234567891.000000000000000003" });

    expect(compareTaxSummaries(a, b).deltas.capital_gains).toEqual({ kind: "delta", value: "1.000000000000000002" });
  });

  it("echoes each year's summary unchanged", () => {
    const a = year({ capital_gains: "7" });

    expect(compareTaxSummaries(a, year()).yearA.summary).toEqual(a.summary);
  });
});
