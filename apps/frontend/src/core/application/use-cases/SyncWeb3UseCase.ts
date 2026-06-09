import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class SyncWeb3UseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(): Promise<void> {
    return await this.taxPort.syncWeb3()
  }
}
