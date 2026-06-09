export interface AssetKpi {
  symbol: string;
  name: string;
  allocationPercent: number;
  roiPercent: number;
}

export interface AssetAllocationItem {
  symbol: string;
  name: string;
  colorHex: string;
  allocationPercent: number;
  valueFiat: number;
}


export interface CryptoKpis {
  totalRoiPercent: number;
  totalRoiFiat: number;
  investedFiat: number;
  delta24hFiat: number;
  maxDrawdownPercent: number;
  maxDrawdownFiat: number;
  recoveredFiat: number;
  winRatePercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageR: number; // Reward to risk ratio average
  bestAsset: AssetKpi;
  worstAsset: AssetKpi;
  portfolioDispersion: number; // Sigma (Volatility)
}

export type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

export interface PerformancePoint {
  timestamp: number; // Unix timestamp
  valueFiat: number;
  costBasisFiat: number;
}

export interface PerformanceMetrics {
  returnFiat: number;
  returnPercent: number;
  volatilityPercent: number;
  bestDayPercent: number;
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
}
