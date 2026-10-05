import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import type { AdvisorToolName } from '@kryptofolio/shared-types';
import type { IAdvisorPort } from '../../domain/ports/IAdvisorPort.js';
import type { AdvisorRequest } from '../../domain/models/AdvisorRequest.js';
import type { AdvisorEvent } from '../../domain/models/AdvisorEvent.js';
import type { AdvisorRunReceiptDraft } from '../../domain/models/AdvisorRunReceipt.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import { resolveChainForRequest } from './models/resolveChainForRequest.js';
import { readExecutionProfiles } from './models/executionProfilesSettings.js';
import { buildModelChainConfig } from './models/buildModelChainConfig.js';
import { resolveToolBudget, resolveRunBudget } from './models/resolveToolBudget.js';
import type { ResolvedExecutionProfile } from './models/resolveExecutionProfile.js';
import { createRunBudgetTracker, type RunBudgetTracker } from './tools/enforceBudget.js';
import { buildImplementedTools, type ToolUseCases, type ToolConfigs } from './tools/index.js';
import { selectExposedTools } from './tools/toolExposure.js';
import { buildTaxAnalystAgent } from './agents/taxAnalyst.js';
import { buildAdvisorAgent } from './agents/advisor.js';
import { streamWithAdvisor } from './agents/runAdvisor.js';
import type { AdvisorRequestContextValues } from './advisorRequestContext.js';
import { bffLogger } from '../../utils/logger.js';
import { isStreamChunkLike, applyChunk, freezeReceipt } from './mastraChunk.js';

export interface MastraAdvisorAdapterDeps {
  userSettingsPort: IUserSettingsPort;
  cryptographyPort: ICryptographyPort;
  vaultPort: IVaultCredentialsPort;
  toolUseCases: ToolUseCases;
  /** Constructed once by the composition root against `ai-advisor.db`, never per request —
   * `observationalMemory: false` belongs on *this* instance's own construction, since a
   * per-call `AgentMemoryOption.options` has no such field to carry it. */
  memory: Memory;
  ollamaBaseURL?: string;
}

function buildToolConfigs(
  profile: ResolvedExecutionProfile,
  request: AdvisorRequest,
  runBudgetTracker: RunBudgetTracker,
): ToolConfigs {
  const maxCharsFor = (tool: AdvisorToolName): number => resolveToolBudget(tool, profile);
  return {
    portfolioSummary: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('portfolio_summary'),
      runBudgetTracker,
    },
    fiscalIntegrity: { maxChars: maxCharsFor('fiscal_integrity'), runBudgetTracker },
    tokenHistory: {
      lotsPageSize: profile.settings.lotsPageSize,
      maxChars: maxCharsFor('token_history'),
      runBudgetTracker,
    },
    assetAllocation: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('asset_allocation'),
      runBudgetTracker,
    },
    riskMetrics: { maxChars: maxCharsFor('risk_metrics'), runBudgetTracker },
    kpis: { maxChars: maxCharsFor('kpis'), runBudgetTracker },
    drawdownCurve: { maxChars: maxCharsFor('drawdown_curve'), runBudgetTracker },
    performanceHistory: { maxChars: maxCharsFor('performance_history'), runBudgetTracker },
    volatilityHeatmap: { maxChars: maxCharsFor('volatility_heatmap'), runBudgetTracker },
    spanishTaxReport: { maxChars: maxCharsFor('spanish_tax_report'), runBudgetTracker },
    livePrices: { maxChars: maxCharsFor('live_prices'), currency: request.baseCurrency, runBudgetTracker },
    fiscalIntegrityRows: {
      rowsPageSize: profile.settings.rowsPageSize,
      maxChars: maxCharsFor('fiscal_integrity_rows'),
      runBudgetTracker,
    },
    tokenLots: {
      lotsPageSize: profile.settings.lotsPageSize,
      maxChars: maxCharsFor('token_lots'),
      runBudgetTracker,
    },
    holdingDetail: { maxChars: maxCharsFor('holding_detail'), runBudgetTracker },
    accountHoldings: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('account_holdings'),
      runBudgetTracker,
    },
    taxYearComparison: { maxChars: maxCharsFor('tax_year_comparison'), runBudgetTracker },
    derivativesPnl: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('derivatives_pnl'),
      runBudgetTracker,
    },
    custodyLocations: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('custody_locations'),
      runBudgetTracker,
    },
    dataGaps: { maxChars: maxCharsFor('data_gaps'), runBudgetTracker },
    explainMetric: { maxChars: maxCharsFor('explain_metric'), runBudgetTracker },
    scenarioPositionValue: { maxChars: maxCharsFor('scenario_position_value'), runBudgetTracker },
    breakevenPrice: { maxChars: maxCharsFor('breakeven_price'), runBudgetTracker },
    scenarioPortfolioShock: {
      topNHoldings: profile.settings.topNHoldings,
      maxChars: maxCharsFor('scenario_portfolio_shock'),
      runBudgetTracker,
    },
    concentrationRisk: { maxChars: maxCharsFor('concentration_risk'), runBudgetTracker },
    txSearch: {
      rowsPageSize: profile.settings.rowsPageSize,
      maxChars: maxCharsFor('tx_search'),
      runBudgetTracker,
    },
  };
}

/**
 * The one file implementing `IAdvisorPort` — the sole Mastra import zone. An async generator over
 * `Agent.stream(...).fullStream` (the call must be awaited before `.fullStream` is read),
 * delegating each chunk to `applyChunk`'s deliberately non-exhaustive switch (`mastraChunk.ts`) — an
 * unrecognized chunk is dropped silently so a future Mastra minor adding a chunk kind cannot break a
 * run.
 *
 * A fresh `taxAnalyst`/`advisor` `Agent` pair is built per call, because the resolved model chain,
 * tool budgets, and `RunBudgetTracker` are all per-request facts — `Agent` construction
 * itself does no I/O, so this costs nothing beyond object allocation. The one thing that is *not*
 * rebuilt per call is `Memory` (constructor-injected): it owns the durable `ai-advisor.db`
 * connection and must be shared across every run.
 */
export class MastraAdvisorAdapter implements IAdvisorPort {
  private readonly deps: MastraAdvisorAdapterDeps;

  constructor(deps: MastraAdvisorAdapterDeps) {
    this.deps = deps;
  }

  async *ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent> {
    const runId = randomUUID();
    const threadId = request.threadId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const draft: AdvisorRunReceiptDraft = { runId, threadId, startedAt, toolsCalled: [] };

    const executionProfiles = await readExecutionProfiles(this.deps.userSettingsPort);
    const resolution = await resolveChainForRequest({
      userSettingsPort: this.deps.userSettingsPort,
      cryptographyPort: this.deps.cryptographyPort,
      vaultPort: this.deps.vaultPort,
      executionProfiles,
    });

    if (resolution.kind === 'failed') {
      yield {
        kind: 'failed',
        runId,
        code: resolution.code,
        receipt: freezeReceipt(draft, undefined, new Date().toISOString()),
      };
      return;
    }

    const { entries, executionProfile } = resolution;
    if (entries.length === 0) {
      // Defensive only: `resolveChainForRequest`'s own contract never returns `ready` with an empty
      // chain — this guards the `entries[0]` read below from ever silently reading `undefined`.
      throw new Error('resolveChainForRequest returned a ready resolution with an empty chain');
    }
    const primaryEntry = entries[0];
    draft.executionProfile = executionProfile.runProfile;
    draft.maxSteps = executionProfile.settings.maxSteps;

    const runBudgetTracker = createRunBudgetTracker(resolveRunBudget(executionProfile));
    const toolConfigs = buildToolConfigs(executionProfile, request, runBudgetTracker);
    const tools = selectExposedTools(
      buildImplementedTools(this.deps.toolUseCases, toolConfigs),
      executionProfile.kind,
    );
    const modelConfig = buildModelChainConfig(entries, this.deps.ollamaBaseURL);

    const taxAnalyst = buildTaxAnalystAgent(tools, modelConfig, executionProfile.kind);
    // `buildAdvisorAgent` wires a grounding detector + disclaimer processor by default.
    const advisor = buildAdvisorAgent({ model: modelConfig, memory: this.deps.memory, taxAnalyst });

    const requestContext = new RequestContext<AdvisorRequestContextValues>([
      ['locale', request.locale],
      ['baseCurrency', request.baseCurrency],
    ]);

    // Cancellation is expressed by the consumer ceasing to iterate; this is the one thing that
    // actually tears down the underlying provider call when that happens.
    const abortController = new AbortController();
    try {
      const output = await streamWithAdvisor(advisor, request.message, {
        requestContext,
        executionProfile,
        memory: {
          thread: threadId,
          resource: 'local',
          options: {
            lastMessages: executionProfile.settings.lastMessages,
            semanticRecall: false,
            workingMemory: { enabled: false },
          },
        },
        abortSignal: abortController.signal,
      });

      for await (const rawChunk of output.fullStream) {
        if (!isStreamChunkLike(rawChunk)) continue;

        const { events, terminal, diagnostic } = applyChunk(rawChunk, {
          draft,
          resolvedChain: entries,
          primaryEntry,
          now: () => new Date().toISOString(),
        });
        if (diagnostic) {
          bffLogger.warn({ runId, ...diagnostic }, 'Advisor run failed: every provider in the chain failed');
        }
        for (const event of events) {
          yield event;
        }
        if (terminal) {
          return;
        }
      }
    } finally {
      abortController.abort();
    }
  }
}
