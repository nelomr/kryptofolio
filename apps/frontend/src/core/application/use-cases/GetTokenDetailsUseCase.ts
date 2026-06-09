import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { CryptoAssetEntity } from '@/core/domain/models/PortfolioEntities'

export class GetTokenDetailsUseCase {
  private readonly portfolioPort: ICryptoPortfolioPort

  constructor(portfolioPort: ICryptoPortfolioPort) {
    this.portfolioPort = portfolioPort
  }

  async execute(symbol: string): Promise<CryptoAssetEntity> {
    return await this.portfolioPort.getTokenDetails(symbol)
  }
}
