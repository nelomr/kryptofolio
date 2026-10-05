import { Money } from "../../value-objects/Money";

export const TAX_SUMMARY_FIELDS = [
  "capital_gains",
  "capital_losses",
  "savings_base_yields",
  "general_base_airdrops",
  "net_patrimonial_result",
  "estimated_irpf",
] as const;
export type TaxSummaryField = (typeof TAX_SUMMARY_FIELDS)[number];

export interface TaxYearFigures {
  summary: Record<TaxSummaryField, string>;
  unconvertibleCount: number;
  excludedFlaggedEvents: number;
  excludedUnresolvedIncomeCount: number;
}

export type TaxYearIncompleteness = "unconvertible_events" | "excluded_flagged_events" | "excluded_unresolved_income";

export type TaxYearCompleteness =
  | { kind: "complete" }
  | { kind: "incomplete"; reasons: TaxYearIncompleteness[] };

export type TaxFieldDelta =
  | { kind: "delta"; value: string }
  | { kind: "delta_incomparable"; value: string };

export interface TaxYearReport extends TaxYearFigures {
  completeness: TaxYearCompleteness;
}

export interface TaxYearComparison {
  yearA: TaxYearReport;
  yearB: TaxYearReport;
  deltas: Record<TaxSummaryField, TaxFieldDelta>;
}

function completenessOf(year: TaxYearFigures): TaxYearCompleteness {
  const reasons: TaxYearIncompleteness[] = [];
  if (year.unconvertibleCount > 0) reasons.push("unconvertible_events");
  if (year.excludedFlaggedEvents > 0) reasons.push("excluded_flagged_events");
  if (year.excludedUnresolvedIncomeCount > 0) reasons.push("excluded_unresolved_income");
  return reasons.length === 0 ? { kind: "complete" } : { kind: "incomplete", reasons };
}

/**
 * B minus A for each field. A year whose totals leave events out is still compared, but every delta
 * says so: the difference between two bases that each omit something is not a real change.
 */
export function compareTaxSummaries(a: TaxYearFigures, b: TaxYearFigures): TaxYearComparison {
  const yearA: TaxYearReport = { ...a, completeness: completenessOf(a) };
  const yearB: TaxYearReport = { ...b, completeness: completenessOf(b) };
  const comparable = yearA.completeness.kind === "complete" && yearB.completeness.kind === "complete";

  const deltas = {} as Record<TaxSummaryField, TaxFieldDelta>;
  for (const field of TAX_SUMMARY_FIELDS) {
    const value = new Money(b.summary[field]).sub(new Money(a.summary[field])).toFixed();
    deltas[field] = comparable ? { kind: "delta", value } : { kind: "delta_incomparable", value };
  }

  return { yearA, yearB, deltas };
}
