import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class DownloadTaxReportUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(year: number, format: 'csv'): Promise<Blob> {
    return await this.taxPort.downloadReport(year, format)
  }
}
