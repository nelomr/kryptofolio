import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  ADVISOR_TOOL_NAMES,
  ADVISOR_TOOL_TIERS,
  type AdvisorToolName,
  type AdvisorToolTier,
} from '../../src/advisor-stream';

/** The tier each tool has in the finished catalogue (design D1). Names not yet added are simply absent from the live map. */
const FINAL_TIER_BY_NAME: Record<string, AdvisorToolTier> = {
  portfolio_summary: 'core',
  holding_detail: 'core',
  account_holdings: 'core',
  kpis: 'core',
  asset_allocation: 'core',
  spanish_tax_report: 'core',
  tax_year_comparison: 'core',
  fiscal_integrity: 'core',
  data_gaps: 'core',
  token_history: 'core',
  live_prices: 'core',
  scenario_position_value: 'core',
  breakeven_price: 'core',
  explain_metric: 'core',
  fiscal_integrity_rows: 'extended',
  token_lots: 'extended',
  risk_metrics: 'extended',
  drawdown_curve: 'extended',
  performance_history: 'extended',
  volatility_heatmap: 'extended',
  derivatives_pnl: 'extended',
  custody_locations: 'extended',
  scenario_portfolio_shock: 'extended',
  concentration_risk: 'extended',
  tx_search: 'extended',
};

describe('ADVISOR_TOOL_TIERS', () => {
  it('has exactly the keys of ADVISOR_TOOL_NAMES', () => {
    expect(Object.keys(ADVISOR_TOOL_TIERS).sort()).toEqual([...ADVISOR_TOOL_NAMES].sort());
  });

  it('assigns every tool to exactly one of core or extended', () => {
    for (const name of ADVISOR_TOOL_NAMES) {
      expect(['core', 'extended']).toContain(ADVISOR_TOOL_TIERS[name]);
    }
  });

  it('agrees with the finished catalogue for every name that exists so far', () => {
    for (const name of ADVISOR_TOOL_NAMES) {
      expect(FINAL_TIER_BY_NAME[name], `${name} must appear in the finished tier table`).toBeDefined();
      expect(ADVISOR_TOOL_TIERS[name], name).toBe(FINAL_TIER_BY_NAME[name]);
    }
  });

  it('is typed as a total record over AdvisorToolName', () => {
    expectTypeOf(ADVISOR_TOOL_TIERS).toEqualTypeOf<Record<AdvisorToolName, AdvisorToolTier>>();
    // @ts-expect-error a name outside the catalogue is not a key
    void ADVISOR_TOOL_TIERS['not_a_tool'];
  });
});
