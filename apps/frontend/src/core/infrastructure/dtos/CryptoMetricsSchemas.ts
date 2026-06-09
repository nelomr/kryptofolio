import { z } from 'zod';

export const AssetKpiSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  allocation_percent: z.number(),
  roi_percent: z.number(),
});

export const CryptoKpisSchema = z.object({
  total_roi_percent: z.number(),
  total_roi_fiat: z.number(),
  invested_fiat: z.number(),
  delta_24h_fiat: z.number(),
  max_drawdown_percent: z.number(),
  max_drawdown_fiat: z.number(),
  recovered_fiat: z.number(),
  win_rate_percent: z.number(),
  total_trades: z.number(),
  winning_trades: z.number(),
  losing_trades: z.number(),
  average_r: z.number(),
  best_asset: AssetKpiSchema,
  worst_asset: AssetKpiSchema,
  portfolio_dispersion: z.number(),
}).transform((val) => ({
  totalRoiPercent: val.total_roi_percent,
  totalRoiFiat: val.total_roi_fiat,
  investedFiat: val.invested_fiat,
  delta24hFiat: val.delta_24h_fiat,
  maxDrawdownPercent: val.max_drawdown_percent,
  maxDrawdownFiat: val.max_drawdown_fiat,
  recoveredFiat: val.recovered_fiat,
  winRatePercent: val.win_rate_percent,
  totalTrades: val.total_trades,
  winningTrades: val.winning_trades,
  losingTrades: val.losing_trades,
  averageR: val.average_r,
  bestAsset: {
    symbol: val.best_asset.symbol,
    name: val.best_asset.name,
    allocationPercent: val.best_asset.allocation_percent,
    roiPercent: val.best_asset.roi_percent,
  },
  worstAsset: {
    symbol: val.worst_asset.symbol,
    name: val.worst_asset.name,
    allocationPercent: val.worst_asset.allocation_percent,
    roiPercent: val.worst_asset.roi_percent,
  },
  portfolioDispersion: val.portfolio_dispersion,
}));

export const PerformancePointSchema = z.object({
  ts: z.number(),
  value: z.number(),
  cost: z.number(),
}).transform((val) => ({
  timestamp: val.ts,
  valueFiat: val.value,
  costBasisFiat: val.cost,
}));

export const PerformanceHistoryResponseSchema = z.object({
  data: z.array(PerformancePointSchema),
  summary: z.object({
    return_fiat: z.number(),
    return_percent: z.number(),
    volatility: z.number(),
    best_day: z.number(),
  }),
}).transform((val) => ({
  history: val.data,
  metrics: {
    returnFiat: val.summary.return_fiat,
    returnPercent: val.summary.return_percent,
    volatilityPercent: val.summary.volatility,
    bestDayPercent: val.summary.best_day,
  },
}));

export const AssetAllocationItemSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  allocation_pct: z.number(),
  value_fiat: z.number()
}).transform((val) => ({
  symbol: val.symbol,
  name: val.name,
  colorHex: val.color,
  allocationPercent: val.allocation_pct,
  valueFiat: val.value_fiat
}));

export const AssetAllocationResponseSchema = z.object({
  assets: z.array(AssetAllocationItemSchema),
  total_assets: z.number(),
  hhi: z.number()
}).transform((val) => ({
  items: val.assets,
  totalAssets: val.total_assets,
  hhiScore: val.hhi
}));
