import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'

export class TriggerRebuildUseCase {
  private readonly portfolioPort: ICryptoPortfolioPort

  constructor(portfolioPort: ICryptoPortfolioPort) {
    this.portfolioPort = portfolioPort
  }

  async execute(): Promise<void> {
    return await this.portfolioPort.triggerRebuild()
  }
}
