import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'

export class GetFuturesTransactionsUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(): Promise<TaxTransactionEntity[]> {
    return await this.taxPort.getFuturesTransactions()
  }
}
