import { z } from 'zod';

/** The metrics `explain_metric` can define. Closed so a model cannot ask for an invented one. */
export const METRIC_IDS = [
  'equity',
  'cost_basis',
  'realized_pnl',
  'unrealized_pnl',
  'max_drawdown',
  'annualised_volatility',
  'sharpe',
  'alpha',
  'beta',
  'hhi',
  'top_n_weight',
  'breakeven_price',
  'rates_incomplete',
  'prices_incomplete',
  'unvalued',
  'irpf_savings_base',
  'net_patrimonial_result',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

export const metricIdSchema = z.enum(METRIC_IDS);
