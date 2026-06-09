import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class UploadTaxFileUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(file: File, market: 'spot' | 'futures'): Promise<void> {
    return await this.taxPort.uploadTaxFile(file, market)
  }
}
