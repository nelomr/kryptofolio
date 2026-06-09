import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class DeleteTransactionUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(id: string): Promise<void> {
    return await this.taxPort.deleteTransaction(id)
  }
}
