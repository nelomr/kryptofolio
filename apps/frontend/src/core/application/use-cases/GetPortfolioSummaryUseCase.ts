import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { PortfolioSummaryEntity } from '@/core/domain/models/PortfolioEntities'

export class GetPortfolioSummaryUseCase {
  private readonly portfolioPort: ICryptoPortfolioPort

  constructor(portfolioPort: ICryptoPortfolioPort) {
    this.portfolioPort = portfolioPort
  }

  async execute(): Promise<PortfolioSummaryEntity> {
    return await this.portfolioPort.getSummary()
  }
}

