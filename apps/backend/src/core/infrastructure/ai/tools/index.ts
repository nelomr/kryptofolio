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
  };
}
