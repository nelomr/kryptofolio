import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TransactionRow } from '@/modules/data-ingestion/types'

export class ImportTransactionsUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(rows: TransactionRow[], market: 'spot' | 'futures', timezone: string): Promise<void> {
    return await this.taxPort.importTransactions(rows, market, timezone)
  }
}
