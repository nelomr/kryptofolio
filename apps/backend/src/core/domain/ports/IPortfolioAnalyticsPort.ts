export interface HoldingsSnapshot {
  assetId: string;
  symbol: string;
  totalQty: string;
  avgUnitCost: string;
  totalCostFiat: string;
  livePrice?: string;
  currentValueFiat?: string;
  unrealizedPnlFiat?: string;
}

export interface DerivativesPnl {
  symbol: string;
  contractName: string;
  realizedPnl: string;
  funding: string;
  fees: string;
  netPnl: string;
}

export interface IPortfolioAnalyticsPort {
  /**
   * Calculates the current holdings snapshot for all assets or a specific account.
   * If livePrices is provided, it will compute current value and unrealized PnL.
   */
  getHoldingsSnapshot(
    accountId?: string,
    livePrices?: Array<{ symbol: string; price: string }>
  ): Promise<HoldingsSnapshot[]>;

  /**
   * Calculates realized PnL, funding, and fees grouped by contract for futures/derivatives.
   */
  getDerivativesPnl(accountId?: string): Promise<DerivativesPnl[]>;
}
