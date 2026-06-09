import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'

export class ValidateTransactionUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(payload: Partial<TaxTransactionEntity>): Promise<void> {
    return await this.taxPort.validateTransaction(payload)
  }
}
