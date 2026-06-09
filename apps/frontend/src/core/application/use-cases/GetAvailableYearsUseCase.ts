import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

export class GetAvailableYearsUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(): Promise<number[]> {
    return await this.taxPort.getAvailableYears()
  }
}
