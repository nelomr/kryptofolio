import { describe, it, expect } from 'vitest';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';

/**
 * The metered per-tool budget table already lives in `@kryptofolio/shared-types`
 * (`defaultExecutionProfiles().metered.toolBudgets`), sourced via `resolveToolBudget`.
 * This asserts the tools' constants rather than re-declaring them — a second,
 * backend-local copy would only invite the two to drift.
 */
describe('metered per-tool character budgets', () => {
  const { toolBudgets } = defaultExecutionProfiles().metered;

  it('portfolio_summary is budgeted at 4000 chars', () => {
    expect(toolBudgets.portfolio_summary).toBe(4000);
  });

  it('fiscal_integrity is budgeted at 6000 chars', () => {
    expect(toolBudgets.fiscal_integrity).toBe(6000);
  });

  it('token_history is budgeted at 6000 chars', () => {
    expect(toolBudgets.token_history).toBe(6000);
  });

  it('asset_allocation is budgeted at 3000 chars', () => {
    expect(toolBudgets.asset_allocation).toBe(3000);
  });

  it('risk_metrics is budgeted at 1500 chars', () => {
    expect(toolBudgets.risk_metrics).toBe(1500);
  });

  it('drawdown_curve is budgeted at 4000 chars', () => {
    expect(toolBudgets.drawdown_curve).toBe(4000);
  });

  it('performance_history is budgeted at 4000 chars', () => {
    expect(toolBudgets.performance_history).toBe(4000);
  });

  it('kpis is budgeted at 3000 chars', () => {
    expect(toolBudgets.kpis).toBe(3000);
  });

  it('volatility_heatmap is budgeted at 4000 chars', () => {
    expect(toolBudgets.volatility_heatmap).toBe(4000);
  });

  it('spanish_tax_report is budgeted at 5000 chars', () => {
    expect(toolBudgets.spanish_tax_report).toBe(5000);
  });

  it('live_prices is budgeted at 2000 chars', () => {
    expect(toolBudgets.live_prices).toBe(2000);
  });

  it('fiscal_integrity_rows is budgeted at 4000 chars', () => {
    expect(toolBudgets.fiscal_integrity_rows).toBe(4000);
  });

  it('token_lots is budgeted at 4000 chars', () => {
    expect(toolBudgets.token_lots).toBe(4000);
  });

  it('holding_detail is budgeted at 3000 chars', () => {
    expect(toolBudgets.holding_detail).toBe(3000);
  });

  it('account_holdings is budgeted at 5000 chars', () => {
    expect(toolBudgets.account_holdings).toBe(5000);
  });

  it('tax_year_comparison is budgeted at 4000 chars', () => {
    expect(toolBudgets.tax_year_comparison).toBe(4000);
  });

  it('derivatives_pnl is budgeted at 4000 chars', () => {
    expect(toolBudgets.derivatives_pnl).toBe(4000);
  });

  it('custody_locations is budgeted at 4000 chars', () => {
    expect(toolBudgets.custody_locations).toBe(4000);
  });

  it('data_gaps is budgeted at 4000 chars', () => {
    expect(toolBudgets.data_gaps).toBe(4000);
  });

  it('explain_metric is budgeted at 2000 chars', () => {
    expect(toolBudgets.explain_metric).toBe(2000);
  });

  it('scenario_position_value is budgeted at 1500 chars', () => {
    expect(toolBudgets.scenario_position_value).toBe(1500);
  });

  it('breakeven_price is budgeted at 1500 chars', () => {
    expect(toolBudgets.breakeven_price).toBe(1500);
  });

  it('scenario_portfolio_shock is budgeted at 4000 chars', () => {
    expect(toolBudgets.scenario_portfolio_shock).toBe(4000);
  });

  it('concentration_risk is budgeted at 2000 chars', () => {
    expect(toolBudgets.concentration_risk).toBe(2000);
  });

  it('tx_search is budgeted at 5000 chars', () => {
    expect(toolBudgets.tx_search).toBe(5000);
  });
});
