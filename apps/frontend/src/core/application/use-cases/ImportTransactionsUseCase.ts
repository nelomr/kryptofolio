import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TransactionRow } from '@/modules/data-ingestion/types'
import type { SourceProfileId } from '@kryptofolio/shared-types'

export class ImportTransactionsUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(
    rows: TransactionRow[],
    market: 'spot' | 'futures',
    timezone: string,
    sourceProfileId: SourceProfileId,
  ): Promise<void> {
    return await this.taxPort.importTransactions(rows, market, timezone, sourceProfileId)
  }
}
