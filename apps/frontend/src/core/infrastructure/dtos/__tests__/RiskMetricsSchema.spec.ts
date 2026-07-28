import { describe, it, expect } from "vitest";
import { RiskMetricsSchema } from "../RiskMetricsSchema";

describe("RiskMetricsSchema", () => {
  it("should parse valid DTO and transform to domain model", () => {
    const rawDto = {
      sharpe_ratio: 2.18,
      sortino_ratio: 2.62,
      beta_vs_btc: 0.87,
      alpha_pct: 4.2,
    };

    const result = RiskMetricsSchema.safeParse(rawDto);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        sharpeRatio: 2.18,
        sortinoRatio: 2.62,
        beta: 0.87,
        betaVsBtc: 0.87,
        alpha: 4.2,
        alphaPercent: 4.2,
        calmarRatio: 3.41,
        maxDrawdownPct: 0,
        annualizedVolatility: 0,
        currency: 'USD',
        history: [],
      });
    }
  });

  it("should fail parsing if properties are missing", () => {
    const rawDto = {
      currency: 'USD',
    };

    const result = RiskMetricsSchema.safeParse(rawDto);
    expect(result.success).toBe(false);
  });

  it("should fail parsing if types are incorrect", () => {
    const rawDto = {
      sharpe_ratio: "invalid-non-numeric-string",
      sortino_ratio: 2.62,
      beta_vs_btc: 0.87,
      alpha_pct: 4.2,
    };

    const result = RiskMetricsSchema.safeParse(rawDto);
    expect(result.success).toBe(false);
  });
});
