import type { DatabaseSync } from 'node:sqlite';
import { AskAdvisorUC } from '../../application/use-cases/AskAdvisorUC.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import { MastraAdvisorAdapter } from '../ai/MastraAdvisorAdapter.js';
import { createAdvisorMemory } from '../ai/createAdvisorMemory.js';
import type { ToolUseCases } from '../ai/tools/index.js';
import { SqliteAdvisorRunLogAdapter } from '../adapters/SqliteAdvisorRunLogAdapter.js';

/** The slice of the composition root the advisor's tools read from. */
export interface ToolUseCaseSource {
  readonly getPortfolioSummaryUseCase: ToolUseCases['portfolioSummary'];
  readonly getFiscalIntegrityUseCase: ToolUseCases['fiscalIntegrity'] & ToolUseCases['fiscalIntegrityRows'];
  readonly getTokenHistoryUseCase: ToolUseCases['tokenHistory'] & ToolUseCases['tokenLots'];
  readonly getAssetAllocationUseCase: ToolUseCases['assetAllocation'];
  readonly getRiskMetricsUseCase: ToolUseCases['riskMetrics'];
  readonly getKpisUseCase: ToolUseCases['kpis'];
  readonly getDrawdownCurveUseCase: ToolUseCases['drawdownCurve'];
  readonly getPerformanceHistoryUseCase: ToolUseCases['performanceHistory'];
  readonly getVolatilityHeatmapUseCase: ToolUseCases['volatilityHeatmap'];
  readonly getSpanishTaxReportUseCase: ToolUseCases['spanishTaxReport'];
  readonly priceHistoryPort: ToolUseCases['priceHistory'];
}

/**
 * Each tool's use case is read from the source every time a run builds its tools, not captured
 * once. The container replaces its analytical use cases when the real DuckDB connection is bound at
 * startup; a capture taken earlier would keep answering from the uninitialized guard forever.
 */
export function lateBoundToolUseCases(source: ToolUseCaseSource): ToolUseCases {
  return {
    get portfolioSummary() { return source.getPortfolioSummaryUseCase; },
    get fiscalIntegrity() { return source.getFiscalIntegrityUseCase; },
    get tokenHistory() { return source.getTokenHistoryUseCase; },
    get assetAllocation() { return source.getAssetAllocationUseCase; },
    get riskMetrics() { return source.getRiskMetricsUseCase; },
    get kpis() { return source.getKpisUseCase; },
    get drawdownCurve() { return source.getDrawdownCurveUseCase; },
    get performanceHistory() { return source.getPerformanceHistoryUseCase; },
    get volatilityHeatmap() { return source.getVolatilityHeatmapUseCase; },
    get spanishTaxReport() { return source.getSpanishTaxReportUseCase; },
    get priceHistory() { return source.priceHistoryPort; },
    get fiscalIntegrityRows() { return source.getFiscalIntegrityUseCase; },
    get tokenLots() { return source.getTokenHistoryUseCase; },
  };
}

export interface AdvisorEnv {
  readonly ollamaBaseURL?: string;
}

/** Read at the composition root and injected, like every other environment-driven setting. */
export function readAdvisorEnv(env: NodeJS.ProcessEnv): AdvisorEnv {
  const ollamaBaseURL = env.OLLAMA_BASE_URL?.trim();
  return ollamaBaseURL ? { ollamaBaseURL } : {};
}

export interface ComposeAskAdvisorDeps extends AdvisorEnv {
  /** The raw ledger handle `SQLiteLedgerAdapter` uses: `ai_advisor_runs` lives in the ledger file. */
  readonly ledgerDb: DatabaseSync;
  readonly advisorDbPath: string;
  readonly userSettingsPort: IUserSettingsPort;
  readonly cryptographyPort: ICryptographyPort;
  readonly vaultPort: IVaultCredentialsPort;
  readonly toolUseCases: ToolUseCases;
}

export function composeAskAdvisor(deps: ComposeAskAdvisorDeps): AskAdvisorUC {
  const advisorPort = new MastraAdvisorAdapter({
    userSettingsPort: deps.userSettingsPort,
    cryptographyPort: deps.cryptographyPort,
    vaultPort: deps.vaultPort,
    toolUseCases: deps.toolUseCases,
    memory: createAdvisorMemory(deps.advisorDbPath),
    ...(deps.ollamaBaseURL !== undefined ? { ollamaBaseURL: deps.ollamaBaseURL } : {}),
  });
  return new AskAdvisorUC(advisorPort, new SqliteAdvisorRunLogAdapter(deps.ledgerDb), deps.userSettingsPort);
}
