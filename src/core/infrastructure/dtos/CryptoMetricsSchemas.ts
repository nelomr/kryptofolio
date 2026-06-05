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
