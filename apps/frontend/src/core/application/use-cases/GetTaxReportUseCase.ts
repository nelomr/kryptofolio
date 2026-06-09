import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { TaxReportEntity } from '@/core/domain/models/FiscalEntities'

export class GetTaxReportUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(year: number, method: string): Promise<TaxReportEntity> {
    return await this.taxPort.getReport(year, method)
  }
}
