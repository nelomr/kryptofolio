export interface HoldingsSnapshot {
  assetId: string;
  symbol: string;
  totalQty: string;
  avgUnitCost: string;
  totalCostFiat: string;
  livePrice?: string;
  currentValueFiat?: string;
  unrealizedPnlFiat?: string;
  currency: string;
  portfolioLocations?: string[];
}

export interface DerivativesPnl {
  symbol: string;
  contractName: string;
  realizedPnl: string;
  funding: string;
  fees: string;
  netPnl: string;
  currency: string;
}

export interface IPortfolioAnalyticsPort {
  /**
   * Calculates the current holdings snapshot for all assets or a specific account.
   */
  getHoldingsSnapshot(
    accountId?: string,
    targetCurrency?: string,
  ): Promise<HoldingsSnapshot[]>;

  /**
   * Calculates realized PnL, funding, and fees grouped by contract for futures/derivatives.
   */
  getDerivativesPnl(
    accountId?: string,
    targetCurrency?: string,
  ): Promise<DerivativesPnl[]>;
}
