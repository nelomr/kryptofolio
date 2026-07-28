export interface AssetKpi {
  symbol: string;
  name: string;
  allocationPercent: number;
  roiPercent: number;
}

export interface AssetAllocationItem {
  assetId?: string;
  symbol: string;
  name: string;
  colorHex: string;
  allocationPercent: number;
  valueFiat: number;
  currency?: string;
}

export interface CryptoKpis {
  totalEquityFiat: number;
  totalCostBasisFiat: number;
  totalUnrealizedPnlFiat: number;
  totalRealizedPnlFiat: number;
  allTimeHighFiat: number;
  maxDrawdownPercent: number;
  annualizedVolatilityPercent: number;
  sharpeRatio: number;
  currency: string;
  // Optional legacy properties for UI cards
  totalRoiPercent?: number;
  totalRoiFiat?: number;
  investedFiat?: number;
  delta24hFiat?: number;
  maxDrawdownFiat?: number;
  recoveredFiat?: number;
  winRatePercent?: number;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  averageR?: number;
  bestAsset?: AssetKpi;
  worstAsset?: AssetKpi;
  portfolioDispersion?: number;
}

export type TimeRange = "1D" | "1W" | "1M" | "1Y" | "5Y" | "ALL";

export interface PerformancePoint {
  timestamp: number; // Unix timestamp
  valueFiat: number;
  costBasisFiat: number;
  drawdownPercent?: number;
  dateStr?: string;
}

export interface PerformanceMetrics {
  returnFiat: number;
  returnPercent: number;
  volatilityPercent: number;
  bestDayPercent: number;
}

export interface HeatmapDay {
  dateStr: string; // YYYY-MM-DD
  returnPercent: number;
}

export interface HeatmapStats {
  best: number;
  worst: number;
  positiveDays: number;
  totalDays: number;
  avg: number;
}

export interface VolatilityHeatmapEntity {
  grid: (HeatmapDay | null)[][];
  stats: HeatmapStats;
}

export interface RiskMetrics {
  maxDrawdownPct: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  alpha: number;
  beta: number;
  currency: string;
  sortinoRatio?: number;
  calmarRatio?: number;
  history?: number[];
}

export interface DrawdownPoint {
  timestamp: number;
  drawdownPercent: number;
  dateStr?: string;
}

export interface ICryptoMetricsPort {
  getKpis(): Promise<CryptoKpis>;
  getPerformanceHistory(range: TimeRange): Promise<{
    history: PerformancePoint[];
    metrics: PerformanceMetrics;
  }>;
  getAssetAllocation(): Promise<{
    items: AssetAllocationItem[];
    totalAssets: number;
    hhiScore: number;
  }>;
  getVolatilityHeatmap(year: number): Promise<VolatilityHeatmapEntity>;
  getRiskMetrics(): Promise<RiskMetrics>;
  getDrawdownCurve(range: TimeRange): Promise<DrawdownPoint[]>;
}
