import {
  portfolioSummaryTool,
  type PortfolioSummaryToolConfig,
  type PortfolioSummaryUseCaseLike,
} from './portfolioSummaryTool.js';
import {
  fiscalIntegrityTool,
  type FiscalIntegrityToolConfig,
  type FiscalIntegrityUseCaseLike,
} from './fiscalIntegrityTool.js';
import {
  tokenHistoryTool,
  type TokenHistoryToolConfig,
  type TokenHistoryUseCaseLike,
} from './tokenHistoryTool.js';
import {
  assetAllocationTool,
  type AssetAllocationToolConfig,
  type AssetAllocationUseCaseLike,
} from './assetAllocationTool.js';
import { riskMetricsTool, type RiskMetricsToolConfig, type RiskMetricsUseCaseLike } from './riskMetricsTool.js';
import { kpisTool, type KpisToolConfig, type KpisUseCaseLike } from './kpisTool.js';
import {
  drawdownCurveTool,
  type DrawdownCurveToolConfig,
  type DrawdownCurveUseCaseLike,
} from './drawdownCurveTool.js';
import {
  performanceHistoryTool,
  type PerformanceHistoryToolConfig,
  type PerformanceHistoryUseCaseLike,
} from './performanceHistoryTool.js';
import {
  volatilityHeatmapTool,
  type VolatilityHeatmapToolConfig,
  type VolatilityHeatmapUseCaseLike,
} from './volatilityHeatmapTool.js';
import {
  spanishTaxReportTool,
  type SpanishTaxReportToolConfig,
  type SpanishTaxReportUseCaseLike,
} from './spanishTaxReportTool.js';
import { livePricesTool, type LivePricesToolConfig } from './livePricesTool.js';
import { resolveLivePriceSnapshot, type PriceSnapshotPortLike } from './livePriceSnapshot.js';
import {
  fiscalIntegrityRowsTool,
  type FiscalIntegrityRowsToolConfig,
  type FiscalIntegrityRowsUseCaseLike,
} from './fiscalIntegrityRowsTool.js';
import { tokenLotsTool, type TokenLotsToolConfig, type TokenLotsUseCaseLike } from './tokenLotsTool.js';
import {
  holdingDetailTool,
  type HoldingDetailToolConfig,
  type HoldingDetailUseCaseLike,
} from './holdingDetailTool.js';
import {
  accountHoldingsTool,
  type AccountHoldingsToolConfig,
  type ListAccountsUseCaseLike,
} from './accountHoldingsTool.js';
import {
  taxYearComparisonTool,
  type TaxYearComparisonToolConfig,
  type TaxYearComparisonUseCaseLike,
} from './taxYearComparisonTool.js';
import {
  derivativesPnlTool,
  type DerivativesPnlToolConfig,
  type DerivativesPnlUseCaseLike,
} from './derivativesPnlTool.js';
import {
  custodyLocationsTool,
  type CustodyLocationsToolConfig,
  type CustodyLocationsUseCaseLike,
} from './custodyLocationsTool.js';
import {
  dataGapsTool,
  type DataGapsToolConfig,
} from './dataGapsTool.js';
import {
  explainMetricTool,
  type ExplainMetricToolConfig,
} from './explainMetricTool.js';
import type { PortfolioScenarioUseCaseLike } from './scenarioUseCase.js';
import {
  scenarioPositionValueTool,
  type ScenarioPositionValueToolConfig,
} from './scenarioPositionValueTool.js';
import {
  breakevenPriceTool,
  type BreakevenPriceToolConfig,
} from './breakevenPriceTool.js';
import {
  scenarioPortfolioShockTool,
  type ScenarioPortfolioShockToolConfig,
} from './scenarioPortfolioShockTool.js';
import {
  concentrationRiskTool,
  type ConcentrationRiskToolConfig,
} from './concentrationRiskTool.js';
import {
  txSearchTool,
  type TxSearchToolConfig,
  type TxSearchUseCaseLike,
} from './txSearchTool.js';

export {
  portfolioSummaryTool,
  fiscalIntegrityTool,
  tokenHistoryTool,
  assetAllocationTool,
  riskMetricsTool,
  kpisTool,
  drawdownCurveTool,
  performanceHistoryTool,
  volatilityHeatmapTool,
  spanishTaxReportTool,
  livePricesTool,
  fiscalIntegrityRowsTool,
  tokenLotsTool,
  holdingDetailTool,
  accountHoldingsTool,
  taxYearComparisonTool,
  derivativesPnlTool,
  custodyLocationsTool,
  dataGapsTool,
  explainMetricTool,
  scenarioPositionValueTool,
  breakevenPriceTool,
  scenarioPortfolioShockTool,
  concentrationRiskTool,
  txSearchTool,
};
export type {
  PortfolioSummaryToolConfig,
  FiscalIntegrityToolConfig,
  TokenHistoryToolConfig,
  AssetAllocationToolConfig,
  RiskMetricsToolConfig,
  KpisToolConfig,
  DrawdownCurveToolConfig,
  PerformanceHistoryToolConfig,
  VolatilityHeatmapToolConfig,
  SpanishTaxReportToolConfig,
  LivePricesToolConfig,
  FiscalIntegrityRowsToolConfig,
  TokenLotsToolConfig,
  HoldingDetailToolConfig,
  AccountHoldingsToolConfig,
  TaxYearComparisonToolConfig,
  DerivativesPnlToolConfig,
  CustodyLocationsToolConfig,
  DataGapsToolConfig,
  ExplainMetricToolConfig,
  ScenarioPositionValueToolConfig,
  BreakevenPriceToolConfig,
  ScenarioPortfolioShockToolConfig,
  ConcentrationRiskToolConfig,
  TxSearchToolConfig,
};

/**
 * The full read-only tool catalogue — thirteen tools total. Every entry is read-only by
 * construction — none wraps a use case or port method that calls a write/mutation method.
 */
export interface ToolUseCases {
  portfolioSummary: PortfolioSummaryUseCaseLike;
  fiscalIntegrity: FiscalIntegrityUseCaseLike;
  tokenHistory: TokenHistoryUseCaseLike;
  assetAllocation: AssetAllocationUseCaseLike;
  riskMetrics: RiskMetricsUseCaseLike;
  kpis: KpisUseCaseLike;
  drawdownCurve: DrawdownCurveUseCaseLike;
  performanceHistory: PerformanceHistoryUseCaseLike;
  volatilityHeatmap: VolatilityHeatmapUseCaseLike;
  spanishTaxReport: SpanishTaxReportUseCaseLike;
  priceHistory: PriceSnapshotPortLike;
  fiscalIntegrityRows: FiscalIntegrityRowsUseCaseLike;
  tokenLots: TokenLotsUseCaseLike;
  portfolioScenario: PortfolioScenarioUseCaseLike;
  holdingDetail: HoldingDetailUseCaseLike;
  listAccounts: ListAccountsUseCaseLike;
  taxYearComparison: TaxYearComparisonUseCaseLike;
  derivativesPnl: DerivativesPnlUseCaseLike;
  custodyLocations: CustodyLocationsUseCaseLike;
  txSearch: TxSearchUseCaseLike;
}

export interface ToolConfigs {
  portfolioSummary: PortfolioSummaryToolConfig;
  fiscalIntegrity: FiscalIntegrityToolConfig;
  tokenHistory: TokenHistoryToolConfig;
  assetAllocation: AssetAllocationToolConfig;
  riskMetrics: RiskMetricsToolConfig;
  kpis: KpisToolConfig;
  drawdownCurve: DrawdownCurveToolConfig;
  performanceHistory: PerformanceHistoryToolConfig;
  volatilityHeatmap: VolatilityHeatmapToolConfig;
  spanishTaxReport: SpanishTaxReportToolConfig;
  livePrices: LivePricesToolConfig;
  fiscalIntegrityRows: FiscalIntegrityRowsToolConfig;
  tokenLots: TokenLotsToolConfig;
  holdingDetail: HoldingDetailToolConfig;
  accountHoldings: AccountHoldingsToolConfig;
  taxYearComparison: TaxYearComparisonToolConfig;
  derivativesPnl: DerivativesPnlToolConfig;
  custodyLocations: CustodyLocationsToolConfig;
  dataGaps: DataGapsToolConfig;
  explainMetric: ExplainMetricToolConfig;
  scenarioPositionValue: ScenarioPositionValueToolConfig;
  breakevenPrice: BreakevenPriceToolConfig;
  scenarioPortfolioShock: ScenarioPortfolioShockToolConfig;
  concentrationRisk: ConcentrationRiskToolConfig;
  txSearch: TxSearchToolConfig;
}

/** `taxAnalyst`'s own tool shape — every caller needs only this, never `ToolUseCases`/`ToolConfigs`. */
export type AdvisorTools = ReturnType<typeof buildImplementedTools>;

export function buildImplementedTools(useCases: ToolUseCases, configs: ToolConfigs) {
  return {
    portfolio_summary: portfolioSummaryTool(useCases.portfolioSummary, {
      ...configs.portfolioSummary,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    fiscal_integrity: fiscalIntegrityTool(useCases.fiscalIntegrity, configs.fiscalIntegrity),
    token_history: tokenHistoryTool(useCases.tokenHistory, configs.tokenHistory),
    asset_allocation: assetAllocationTool(useCases.assetAllocation, configs.assetAllocation),
    risk_metrics: riskMetricsTool(useCases.riskMetrics, configs.riskMetrics),
    kpis: kpisTool(useCases.kpis, configs.kpis),
    drawdown_curve: drawdownCurveTool(useCases.drawdownCurve, configs.drawdownCurve),
    performance_history: performanceHistoryTool(useCases.performanceHistory, configs.performanceHistory),
    volatility_heatmap: volatilityHeatmapTool(useCases.volatilityHeatmap, configs.volatilityHeatmap),
    spanish_tax_report: spanishTaxReportTool(useCases.spanishTaxReport, configs.spanishTaxReport),
    live_prices: livePricesTool(useCases.priceHistory, configs.livePrices),
    fiscal_integrity_rows: fiscalIntegrityRowsTool(useCases.fiscalIntegrityRows, configs.fiscalIntegrityRows),
    token_lots: tokenLotsTool(useCases.tokenLots, configs.tokenLots),
    holding_detail: holdingDetailTool(useCases.holdingDetail, {
      ...configs.holdingDetail,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    account_holdings: accountHoldingsTool(
      { listAccounts: useCases.listAccounts, portfolioSummary: useCases.portfolioSummary },
      {
        ...configs.accountHoldings,
        livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
      },
    ),
    tax_year_comparison: taxYearComparisonTool(useCases.taxYearComparison, configs.taxYearComparison),
    derivatives_pnl: derivativesPnlTool(useCases.derivativesPnl, configs.derivativesPnl),
    custody_locations: custodyLocationsTool(useCases.custodyLocations, configs.custodyLocations),
    data_gaps: dataGapsTool(
      { portfolioSummary: useCases.portfolioSummary, fiscalIntegrity: useCases.fiscalIntegrity },
      {
        ...configs.dataGaps,
        livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
      },
    ),
    explain_metric: explainMetricTool(configs.explainMetric),
    scenario_position_value: scenarioPositionValueTool(useCases.portfolioScenario, {
      ...configs.scenarioPositionValue,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    breakeven_price: breakevenPriceTool(useCases.portfolioScenario, {
      ...configs.breakevenPrice,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    scenario_portfolio_shock: scenarioPortfolioShockTool(useCases.portfolioScenario, {
      ...configs.scenarioPortfolioShock,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    concentration_risk: concentrationRiskTool(useCases.portfolioScenario, {
      ...configs.concentrationRisk,
      livePrices: (currency) => resolveLivePriceSnapshot(useCases.priceHistory, currency),
    }),
    tx_search: txSearchTool(useCases.txSearch, configs.txSearch),
  };
}
