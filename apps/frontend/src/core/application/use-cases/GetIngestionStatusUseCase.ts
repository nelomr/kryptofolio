import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { IngestionStatusEntity } from '@/core/domain/models/PortfolioEntities'

export class GetIngestionStatusUseCase {
  private readonly portfolioPort: ICryptoPortfolioPort

  constructor(portfolioPort: ICryptoPortfolioPort) {
    this.portfolioPort = portfolioPort
  }

  async execute(): Promise<IngestionStatusEntity> {
    return await this.portfolioPort.getIngestionStatus()
  }
}
