import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class DeleteAllTransactionsUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(market: 'spot' | 'futures'): Promise<void> {
    return await this.taxPort.deleteAllTransactions(market)
  }
}
