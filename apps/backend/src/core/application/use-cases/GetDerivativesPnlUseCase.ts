import type { DerivativesPnl, IPortfolioAnalyticsPort } from '../../domain/ports/IPortfolioAnalyticsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** Every account together: derivatives PnL has no per-account view in the advisor. */
export class GetDerivativesPnlUseCase {
  private readonly portfolioAnalyticsPort: IPortfolioAnalyticsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(portfolioAnalyticsPort: IPortfolioAnalyticsPort, freshnessService: FifoChainFreshnessService) {
    this.portfolioAnalyticsPort = portfolioAnalyticsPort;
    this.freshnessService = freshnessService;
  }

  async execute(targetCurrency: string): Promise<DerivativesPnl[]> {
    await this.freshnessService.ensureFresh();
    return this.portfolioAnalyticsPort.getDerivativesPnl(undefined, targetCurrency);
  }
}
