export interface AssetKpiSummary {
  symbol: string;
  name: string;
  allocationPct: number;
  roiPct: number;
}

export interface MetricsKpis {
  /**
   * Some figure feeding these totals could not be expressed in the requested currency.
   *
   * A total that silently omits an unconvertible figure is indistinguishable from one where that
   * figure was genuinely zero, so the incompleteness travels with the total rather than being
   * inferred from it.
   */
  ratesIncomplete: boolean;
  /**
   * Some asset holds a balance no price series ever valued, so its worth is absent from these
   * totals.
   *
   * Reported apart from `ratesIncomplete` because the two have opposite remedies — a price gap is
   * closed by seeding the price series, a rate gap by seeding the FX ledger — and a single flag
   * covering both names the wrong one. `excludedFlaggedLots` does not cover this: it counts lots
   * carrying a persisted quality flag, while an asset with a sound lot and no price row at all
   * carries none.
   */
  pricesIncomplete: boolean;
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
  /**
   * Open lots whose cost basis carries a data-quality defect and is therefore absent from
   * `totalCostBasis`.
   *
   * Reported rather than merely filtered: a basis silently dropped makes the headline figure look
   * complete when it is not, and every derived percentage — unrealised P&L, ROI — inherits that.
   */
  excludedFlaggedLots?: number;
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
