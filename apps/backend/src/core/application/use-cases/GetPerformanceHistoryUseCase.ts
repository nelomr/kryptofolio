import type { IMetricsPort, PerformanceHistoryPoint } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** GetPerformanceHistoryUseCase — a thin read use case over `IMetricsPort.getPerformanceHistory` (design D4). */
export class GetPerformanceHistoryUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(days?: number, targetCurrency?: string): Promise<PerformanceHistoryPoint[]> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getPerformanceHistory(days, targetCurrency);
  }
}
