import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'

export class UpdateTransactionUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(id: string, data: Partial<TaxTransactionEntity>): Promise<void> {
    return await this.taxPort.updateTransaction(id, data)
  }
}
