import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'

export class GetFuturesDerivativesUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(): Promise<TaxDerivativeEntity[]> {
    return await this.taxPort.getFuturesDerivatives()
  }
}
