import type { IMetricsPort, AssetAllocationItem } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** GetAssetAllocationUseCase — a thin read use case over `IMetricsPort.getAssetAllocation` (design D4). */
export class GetAssetAllocationUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(targetCurrency?: string): Promise<AssetAllocationItem[]> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getAssetAllocation(targetCurrency);
  }
}
