import type { ConvertedAmount } from '@kryptofolio/shared-types';

export interface HoldingsSnapshot {
  assetId: string;
  symbol: string;
  totalQty: string;
  avgUnitCost: string;
  totalCostFiat: string;
  /**
   * How the cost basis reached the requested currency, or why it could not.
   *
   * Separate from `totalCostFiat`, which is always the honest number: when the outcome is
   * `UNCONVERTIBLE` that number is still in the lot's native currency, and this field is the
   * only thing that says so. A conversion failing is not a lot quality defect — the lot is
   * sound and the view cannot express it — so it never touches `quality_flag`, and it is not
   * persistable in principle: the display currency is unknown at materialisation time.
   */
  costBasis: ConvertedAmount;
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
