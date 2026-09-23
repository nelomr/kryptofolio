import type { IMetricsPort, DrawdownPoint } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/** GetDrawdownCurveUseCase — a thin read use case over `IMetricsPort.getDrawdownCurve` (design D4). */
export class GetDrawdownCurveUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(days?: number, targetCurrency?: string): Promise<DrawdownPoint[]> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getDrawdownCurve(days, targetCurrency);
  }
}
