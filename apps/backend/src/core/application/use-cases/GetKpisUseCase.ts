import type { IMetricsPort, MetricsKpis } from '../../domain/ports/IMetricsPort.js';
import type { FifoChainFreshnessService } from '../services/FifoChainFreshnessService.js';

/**
 * GetKpisUseCase — a thin read use case over `IMetricsPort.getKpis`.
 *
 * Exists so `ensureFresh()` has a use case to live in (design D4): the route used to call
 * `metricsPort.getKpis` directly, which is exactly the "business logic in a route" rule 8
 * forbids, and left no place for the freshness gate that must run before every derived-chain
 * read. A use case is correct when invoked outside HTTP; a route middleware would not be.
 */
export class GetKpisUseCase {
  private readonly metricsPort: IMetricsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(metricsPort: IMetricsPort, freshnessService: FifoChainFreshnessService) {
    this.metricsPort = metricsPort;
    this.freshnessService = freshnessService;
  }

  public async execute(targetCurrency?: string): Promise<MetricsKpis> {
    await this.freshnessService.ensureFresh();
    return this.metricsPort.getKpis(targetCurrency);
  }
}
