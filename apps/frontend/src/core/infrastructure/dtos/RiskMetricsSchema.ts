import { z } from 'zod';
import type { RiskMetrics } from '@/core/domain/ports/ICryptoMetricsPort';
import { numericField } from './CommonSchemaHelpers';

export const RiskMetricsSchema = z
  .object({
    // Phase 2B backend properties
    maxDrawdownPct: numericField.optional(),
    max_drawdown_pct: numericField.optional(),
    annualizedVolatility: numericField.optional(),
    annualized_volatility: numericField.optional(),
    sharpeRatio: numericField.optional(),
    sharpe_ratio: numericField.optional(),
    alpha: numericField.optional(),
    alpha_pct: numericField.optional(),
    beta: numericField.optional(),
    beta_vs_btc: numericField.optional(),
    currency: z.string().default('USD'),

    // Legacy fields
    sortino_ratio: numericField.optional(),
    calmar_ratio: numericField.optional(),
    history: z.array(numericField).optional().default([]),
  })
  .refine(
    (data) =>
      (data.sharpeRatio !== undefined || data.sharpe_ratio !== undefined) &&
      (data.sortino_ratio !== undefined || data.maxDrawdownPct !== undefined || data.max_drawdown_pct !== undefined),
    { message: 'RiskMetrics must contain sharpe_ratio and sortino_ratio or maxDrawdownPct' },
  )
  .transform(
    (data): RiskMetrics & { alphaPercent?: number; betaVsBtc?: number } => {
      const alpha = data.alpha ?? data.alpha_pct ?? 0;
      const beta = data.beta ?? data.beta_vs_btc ?? 1;
      return {
        maxDrawdownPct: data.maxDrawdownPct ?? data.max_drawdown_pct ?? 0,
        annualizedVolatility: data.annualizedVolatility ?? data.annualized_volatility ?? 0,
        sharpeRatio: data.sharpeRatio ?? data.sharpe_ratio ?? 0,
        alpha,
        alphaPercent: alpha,
        beta,
        betaVsBtc: beta,
        currency: data.currency,
        sortinoRatio: data.sortino_ratio ?? 0,
        calmarRatio: data.calmar_ratio ?? 3.41,
        history: data.history,
      };
    },
  );
