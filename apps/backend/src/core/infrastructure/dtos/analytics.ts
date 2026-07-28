import { z } from 'zod';
import { TaxLotSchema, TaxLotEventSchema } from '@kryptofolio/shared-types';

export const HoldingsSnapshotSchema = z.object({
  assetId: z.string(),
  symbol: z.string(),
  totalQty: z.string(),
  avgUnitCost: z.string(),
  totalCostFiat: z.string(),
  livePrice: z.string().optional(),
  currentValueFiat: z.string().optional(),
  unrealizedPnlFiat: z.string().optional(),
  currency: z.string().min(3).max(3),
  portfolioLocations: z.array(z.string()).optional().default([]),
});

export const DerivativesPnlSchema = z.object({
  symbol: z.string(),
  contractName: z.string(),
  realizedPnl: z.string(),
  funding: z.string(),
  fees: z.string(),
  netPnl: z.string(),
  currency: z.string().min(3).max(3),
});

export const SpotFifoResultSchema = z.object({
  lots: z.array(TaxLotSchema),
  events: z.array(TaxLotEventSchema),
});

export const SpanishTaxBaseReportSchema = z.object({
  year: z.number().int(),
  savingsBaseYields: z.string(),
  generalBaseAirdrops: z.string(),
  spotCapitalGains: z.string(),
});

export type HoldingsSnapshotDto = z.infer<typeof HoldingsSnapshotSchema>;
export type DerivativesPnlDto = z.infer<typeof DerivativesPnlSchema>;
export type SpotFifoResultDto = z.infer<typeof SpotFifoResultSchema>;
export type SpanishTaxBaseReportDto = z.infer<typeof SpanishTaxBaseReportSchema>;
