import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { TokenHistoryEntity } from '@/core/domain/models/PortfolioEntities'

export class GetTokenHistoryUseCase {
  private readonly portfolioPort: ICryptoPortfolioPort

  constructor(portfolioPort: ICryptoPortfolioPort) {
    this.portfolioPort = portfolioPort
  }

  async execute(symbol: string): Promise<TokenHistoryEntity> {
    return await this.portfolioPort.getTokenHistory(symbol)
  }
}
