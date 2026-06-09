import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class ImportWalletUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(chain: string, address: string): Promise<void> {
    return await this.taxPort.importWallet(chain, address)
  }
}
