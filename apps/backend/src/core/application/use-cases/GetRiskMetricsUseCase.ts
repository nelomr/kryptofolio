import type { IMetricsPort, RiskMetrics } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** GetRiskMetricsUseCase — a thin read use case over `IMetricsPort.getRiskMetrics` (design D4). */
export class GetRiskMetricsUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(targetCurrency?: string): Promise<RiskMetrics> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getRiskMetrics(targetCurrency);
  }
}
