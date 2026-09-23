import type { IMetricsPort, VolatilityHeatmapCell } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** GetVolatilityHeatmapUseCase — a thin read use case over `IMetricsPort.getVolatilityHeatmap` (design D4). */
export class GetVolatilityHeatmapUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(year?: number, targetCurrency?: string): Promise<VolatilityHeatmapCell[]> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getVolatilityHeatmap(year, targetCurrency);
  }
}
