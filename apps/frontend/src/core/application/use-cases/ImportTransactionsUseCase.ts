import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { IngestionOutcomeEntity } from '@/core/domain/models/FiscalEntities'
import type { SourceProfileId, TransactionRow } from '@kryptofolio/shared-types'

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
  ): Promise<IngestionOutcomeEntity> {
    return await this.taxPort.importTransactions(rows, market, timezone, sourceProfileId)
  }
}
