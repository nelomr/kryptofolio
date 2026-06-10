import { z } from 'zod';
import type { RiskMetrics } from '@/core/domain/ports/ICryptoMetricsPort';

export const RiskMetricsSchema = z.object({
  sharpe_ratio: z.number(),
  sortino_ratio: z.number(),
  calmar_ratio: z.number().default(3.41),
  beta_vs_btc: z.number(),
  alpha_pct: z.number(),
  history: z.array(z.number()).default([])
}).transform((data): RiskMetrics => ({
  sharpeRatio: data.sharpe_ratio,
  sortinoRatio: data.sortino_ratio,
  calmarRatio: data.calmar_ratio,
  betaVsBtc: data.beta_vs_btc,
  alphaPercent: data.alpha_pct,
  history: data.history
}));
