import { z } from 'zod';
import { generateAssetColor } from '@kryptofolio/shared-types';
import { numericField } from './CommonSchemaHelpers';

export const AssetKpiSchema = z
  .object({
    symbol: z.string().default(''),
    name: z.string().default(''),
    allocation_percent: numericField.optional(),
    allocationPercent: numericField.optional(),
    allocationPct: numericField.optional(),
    roi_percent: numericField.optional(),
    roiPercent: numericField.optional(),
    roiPct: numericField.optional(),
  })
  .transform((val) => ({
    symbol: val.symbol,
    name: val.name || val.symbol,
    allocationPercent: val.allocationPct ?? val.allocationPercent ?? val.allocation_percent ?? 0,
    roiPercent: val.roiPct ?? val.roiPercent ?? val.roi_percent ?? 0,
  }));

export const CryptoKpisSchema = z
  .object({
    // Phase 2B & analytical backend properties (camelCase & snake_case)
    totalEquity: numericField.optional(),
    total_equity_fiat: numericField.optional(),
    totalCostBasis: numericField.optional(),
    total_cost_basis_fiat: numericField.optional(),
    totalUnrealizedPnl: numericField.optional(),
    total_unrealized_pnl_fiat: numericField.optional(),
    totalRealizedPnl: numericField.optional(),
    total_realized_pnl_fiat: numericField.optional(),
    allTimeHigh: numericField.optional(),
    all_time_high: numericField.optional(),
    maxDrawdownPct: numericField.optional(),
    max_drawdown_percent: numericField.optional(),
    annualizedVolatility: numericField.optional(),
    portfolio_dispersion: numericField.optional(),
    sharpeRatio: numericField.optional(),
    sharpe_ratio: numericField.optional(),
    currency: z.string().default('USD'),

    // Extended analytical & legacy properties
    totalRoiPercent: numericField.optional(),
    total_roi_percent: numericField.optional(),
    totalRoiFiat: numericField.optional(),
    total_roi_fiat: numericField.optional(),
    invested_fiat: numericField.optional(),
    delta24hFiat: numericField.optional(),
    delta_24h_fiat: numericField.optional(),
    maxDrawdownFiat: numericField.optional(),
    max_drawdown_fiat: numericField.optional(),
    recoveredFiat: numericField.optional(),
    recovered_fiat: numericField.optional(),
    winRatePercent: numericField.optional(),
    win_rate_percent: numericField.optional(),
    totalTrades: numericField.optional(),
    total_trades: numericField.optional(),
    winningTrades: numericField.optional(),
    winning_trades: numericField.optional(),
    losingTrades: numericField.optional(),
    losing_trades: numericField.optional(),
    averageR: numericField.optional(),
    average_r: numericField.optional(),
    bestAsset: AssetKpiSchema.nullable().optional(),
    best_asset: AssetKpiSchema.nullable().optional(),
    worstAsset: AssetKpiSchema.nullable().optional(),
    worst_asset: AssetKpiSchema.nullable().optional(),
  })
  .refine(
    (raw) =>
      raw.totalEquity !== undefined ||
      raw.total_equity_fiat !== undefined ||
      raw.totalCostBasis !== undefined ||
      raw.total_cost_basis_fiat !== undefined ||
      raw.bestAsset !== undefined ||
      raw.best_asset !== undefined,
    { message: 'CryptoKpis must contain either Phase 2B metrics or bestAsset' },
  )
  .transform((raw) => {
    const totalEquityFiat = raw.totalEquity ?? raw.total_equity_fiat ?? raw.invested_fiat ?? 0;
    const totalCostBasisFiat = raw.totalCostBasis ?? raw.total_cost_basis_fiat ?? raw.invested_fiat ?? 0;
    const totalUnrealizedPnlFiat = raw.totalUnrealizedPnl ?? raw.total_unrealized_pnl_fiat ?? 0;
    const totalRealizedPnlFiat = raw.totalRealizedPnl ?? raw.total_realized_pnl_fiat ?? 0;
    const allTimeHighFiat = raw.allTimeHigh ?? raw.all_time_high ?? totalEquityFiat;
    const maxDrawdownPercent = raw.maxDrawdownPct ?? raw.max_drawdown_percent ?? 0;
    const annualizedVolatilityPercent = raw.annualizedVolatility ?? raw.portfolio_dispersion ?? 0;
    const sharpeRatio = raw.sharpeRatio ?? raw.sharpe_ratio ?? 0;

    const totalRoiFiat = raw.totalRoiFiat ?? raw.total_roi_fiat ?? (totalUnrealizedPnlFiat + totalRealizedPnlFiat);
    const totalRoiPercent = raw.totalRoiPercent ?? raw.total_roi_percent ?? (totalCostBasisFiat > 0 ? (totalRoiFiat / totalCostBasisFiat) * 100 : 0);

    const bestAsset = raw.bestAsset ?? raw.best_asset;
    const worstAsset = raw.worstAsset ?? raw.worst_asset;

    return {
      totalEquityFiat,
      totalCostBasisFiat,
      totalUnrealizedPnlFiat,
      totalRealizedPnlFiat,
      allTimeHighFiat,
      maxDrawdownPercent,
      annualizedVolatilityPercent,
      sharpeRatio,
      currency: raw.currency,
      totalRoiPercent,
      totalRoiFiat,
      investedFiat: totalCostBasisFiat,
      delta24hFiat: raw.delta24hFiat ?? raw.delta_24h_fiat ?? 0,
      maxDrawdownFiat: raw.maxDrawdownFiat ?? raw.max_drawdown_fiat ?? 0,
      recoveredFiat: raw.recoveredFiat ?? raw.recovered_fiat ?? 0,
      winRatePercent: raw.winRatePercent ?? raw.win_rate_percent ?? 0,
      totalTrades: raw.totalTrades ?? raw.total_trades ?? 0,
      winningTrades: raw.winningTrades ?? raw.winning_trades ?? 0,
      losingTrades: raw.losingTrades ?? raw.losing_trades ?? 0,
      averageR: raw.averageR ?? raw.average_r ?? 0,
      bestAsset: bestAsset
        ? {
            symbol: bestAsset.symbol,
            name: bestAsset.name || bestAsset.symbol,
            allocationPercent: bestAsset.allocationPercent,
            roiPercent: bestAsset.roiPercent,
          }
        : undefined,
      worstAsset: worstAsset
        ? {
            symbol: worstAsset.symbol,
            name: worstAsset.name || worstAsset.symbol,
            allocationPercent: worstAsset.allocationPercent,
            roiPercent: worstAsset.roiPercent,
          }
        : undefined,
      portfolioDispersion: annualizedVolatilityPercent,
    };
  });

export const PerformancePointSchema = z
  .object({
    date: z.string().optional(),
    ts: numericField.optional(),
    portfolioValue: numericField.optional(),
    value: numericField.optional(),
    btcValue: numericField.optional(),
    costBasisFiat: numericField.optional(),
    cost: numericField.optional(),
    drawdownPct: numericField.optional(),
  })
  .transform((val) => {
    const timestamp = val.ts ?? (val.date ? new Date(val.date).getTime() : Date.now());
    const valueFiat = val.portfolioValue ?? val.value ?? 0;
    const costBasisFiat = val.costBasisFiat ?? val.cost ?? 0;
    return {
      timestamp,
      dateStr: val.date ?? new Date(timestamp).toISOString().split('T')[0],
      valueFiat,
      costBasisFiat,
      drawdownPercent: val.drawdownPct ?? 0,
    };
  });

export const PerformanceHistoryResponseSchema = z
  .union([
    z.array(PerformancePointSchema).transform((arr) => ({
      history: arr,
      metrics: {
        returnFiat: arr.length > 0 ? arr[arr.length - 1].valueFiat - arr[0].valueFiat : 0,
        returnPercent: arr.length > 0 && arr[0].valueFiat > 0 ? ((arr[arr.length - 1].valueFiat - arr[0].valueFiat) / arr[0].valueFiat) * 100 : 0,
        volatilityPercent: 0,
        bestDayPercent: 0,
      },
    })),
    z.object({
      data: z.array(PerformancePointSchema),
      summary: z.object({
        return_fiat: numericField,
        return_percent: numericField,
        volatility: numericField,
        best_day: numericField,
      }),
    }).transform((val) => ({
      history: val.data,
      metrics: {
        returnFiat: val.summary.return_fiat,
        returnPercent: val.summary.return_percent,
        volatilityPercent: val.summary.volatility,
        bestDayPercent: val.summary.best_day,
      },
    })),
  ]);

export const AssetAllocationItemSchema = z
  .object({
    assetId: z.string().optional(),
    symbol: z.string(),
    name: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    colorHex: z.string().optional(),
    allocationPct: numericField.optional(),
    allocation_pct: numericField.optional(),
    valueFiat: numericField.optional(),
    value_fiat: numericField.optional(),
  })
  .transform((val) => ({
    symbol: val.symbol,
    name: val.name ?? val.symbol,
    colorHex: val.colorHex ?? val.color ?? generateAssetColor(val.symbol),
    allocationPercent: val.allocationPct ?? val.allocation_pct ?? 0,
    valueFiat: val.valueFiat ?? val.value_fiat ?? 0,
  }));

export const AssetAllocationResponseSchema = z
  .union([
    z.array(AssetAllocationItemSchema).transform((items) => ({
      items,
      totalAssets: items.length,
      hhiScore: 0,
    })),
    z.object({
      items: z.array(AssetAllocationItemSchema),
      totalAssets: numericField.optional(),
      total_assets: numericField.optional(),
      hhiScore: numericField.optional(),
      hhi: numericField.optional(),
    }).transform((val) => ({
      items: val.items,
      totalAssets: val.totalAssets ?? val.total_assets ?? val.items.length,
      hhiScore: val.hhiScore ?? val.hhi ?? 0,
    })),
    z.object({
      assets: z.array(AssetAllocationItemSchema),
      total_assets: numericField.optional(),
      hhi: numericField.optional(),
    }).transform((val) => ({
      items: val.assets,
      totalAssets: val.total_assets ?? val.assets.length,
      hhiScore: val.hhi ?? 0,
    })),
  ]);

export const HeatmapDaySchema = z
  .object({
    date: z.string(),
    volatility: numericField.optional(),
    pct: numericField.optional(),
  })
  .transform((val) => ({
    dateStr: val.date,
    returnPercent: val.volatility ?? val.pct ?? 0,
  }));

export const VolatilityHeatmapResponseSchema = z.array(HeatmapDaySchema);

export const DrawdownPointSchema = z
  .object({
    date: z.string().optional(),
    ts: numericField.optional(),
    drawdownPct: numericField.optional(),
    drawdown_percent: numericField.optional(),
  })
  .transform((val) => {
    const rawDd = val.drawdownPct ?? val.drawdown_percent ?? 0;
    return {
      timestamp: val.ts ?? (val.date ? new Date(val.date).getTime() : Date.now()),
      dateStr: val.date,
      drawdownPercent: Math.min(rawDd, 0),
    };
  });

export const DrawdownCurveResponseSchema = z.array(DrawdownPointSchema);
