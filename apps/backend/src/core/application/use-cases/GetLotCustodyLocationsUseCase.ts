import { summarizeCustodyLocations, type CustodySummary } from '@kryptofolio/core-domain';
import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

export interface GetLotCustodyLocationsRequest {
  symbol?: string;
}

/** Where each asset is held right now, from the custody ledger. Never feeds or reorders the tax FIFO. */
export class GetLotCustodyLocationsUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(taxCalculatorPort: ITaxCalculatorPort, freshnessService: FifoChainFreshnessService) {
    this.taxCalculatorPort = taxCalculatorPort;
    this.freshnessService = freshnessService;
  }

  async execute(request: GetLotCustodyLocationsRequest): Promise<CustodySummary> {
    await this.freshnessService.ensureFresh();
    const rows = await this.taxCalculatorPort.getLotCustodyLocations(undefined);
    return summarizeCustodyLocations(rows, request.symbol);
  }
}
