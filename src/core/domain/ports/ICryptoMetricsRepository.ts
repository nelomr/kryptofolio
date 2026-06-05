export interface AssetKpi {
  symbol: string;
  name: string;
  allocationPercent: number;
  roiPercent: number;
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

export interface ICryptoMetricsRepository {
  getKpis(): Promise<CryptoKpis>;
}
