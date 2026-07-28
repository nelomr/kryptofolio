export interface AssetKpiSummary {
  symbol: string;
  name: string;
  allocationPct: number;
  roiPct: number;
}

export interface MetricsKpis {
  totalEquity: string;
  totalCostBasis: string;
  totalUnrealizedPnl: string;
  totalRealizedPnl: string;
  allTimeHigh: string;
  maxDrawdownPct: string;
  annualizedVolatility: string;
  sharpeRatio: string;
  currency: string;
  delta24hFiat?: string;
  maxDrawdownFiat?: string;
  recoveredFiat?: string;
  winRatePercent?: number;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  averageR?: number;
  bestAsset?: AssetKpiSummary | null;
  worstAsset?: AssetKpiSummary | null;
  totalRoiPercent?: number;
  totalRoiFiat?: string;
}


export interface PerformanceHistoryPoint {
  date: string;
  portfolioValue: string;
  btcValue?: string;
  drawdownPct: string;
}

export interface AssetAllocationItem {
  assetId: string;
  symbol: string;
  color?: string;
  allocationPct: string;
  valueFiat: string;
  currency: string;
}

export interface VolatilityHeatmapCell {
  date: string;
  volatility: string;
}

export interface RiskMetrics {
  maxDrawdownPct: string;
  annualizedVolatility: string;
  sharpeRatio: string;
  alpha: string;
  beta: string;
  currency: string;
}

export interface DrawdownPoint {
  date: string;
  drawdownPct: string;
}

export interface IMetricsPort {
  getKpis(targetCurrency?: string): Promise<MetricsKpis>;
  getPerformanceHistory(
    days?: number,
    targetCurrency?: string,
  ): Promise<PerformanceHistoryPoint[]>;
  getAssetAllocation(targetCurrency?: string): Promise<AssetAllocationItem[]>;
  getVolatilityHeatmap(
    year?: number,
    targetCurrency?: string,
  ): Promise<VolatilityHeatmapCell[]>;
  getRiskMetrics(targetCurrency?: string): Promise<RiskMetrics>;
  getDrawdownCurve(
    days?: number,
    targetCurrency?: string,
  ): Promise<DrawdownPoint[]>;
}
