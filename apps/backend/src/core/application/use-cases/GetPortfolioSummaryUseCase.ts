import Decimal from 'decimal.js';
import type {
  IPortfolioAnalyticsPort,
  HoldingsSnapshot,
} from '../../domain/ports/IPortfolioAnalyticsPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IMetricsPort } from '../../domain/ports/IMetricsPort.js';

export interface GetPortfolioSummaryRequest {
  accountId?: string;
  targetCurrency?: string;
  livePrices?: Map<string, string>;
}

export interface PortfolioSummaryMetricsDto {
  total_equity_fiat: string;
  total_cost_basis_fiat: string;
  total_realized_pnl_fiat: string;
  total_unrealized_pnl_fiat: string;
  total_pnl_fiat: string;
  currency: string;
}

export interface PortfolioHoldingDto {
  id: string;
  symbol: string;
  amount: string;
  avg_price_fiat: string;
  cost_basis_fiat: string;
  live_price?: string;
  current_value_fiat?: string;
  unrealized_pnl_fiat?: string;
  currency: string;
  portfolio_locations: string[];
}

export interface PortfolioSummaryResponse {
  metrics: PortfolioSummaryMetricsDto;
  holdings: PortfolioHoldingDto[];
}

/**
 * Pure transformation function: calculates live price, current value, and unrealized PnL.
 */
export function calculateHoldingsSummary(
  holdings: HoldingsSnapshot[],
  livePrices?: Map<string, string>,
): HoldingsSnapshot[] {
  return holdings.map((item) => {
    const livePriceStr = livePrices?.get(item.symbol) ?? item.livePrice;

    if (!livePriceStr) {
      return item;
    }

    const totalQty = new Decimal(item.totalQty);
    const totalCost = new Decimal(item.totalCostFiat);
    const livePrice = new Decimal(livePriceStr);

    const currentValue = totalQty.mul(livePrice);
    const unrealizedPnl = currentValue.sub(totalCost);

    return {
      ...item,
      livePrice: livePrice.toFixed(2),
      currentValueFiat: currentValue.toFixed(2),
      unrealizedPnlFiat: unrealizedPnl.toFixed(2),
    };
  });
}

/**
 * GetPortfolioSummaryUseCase — Functional Sandwich Pattern.
 *
 * Encapsulates full portfolio summary orchestration and DTO mapping.
 * 1. (Impure Effect) Fetch base_currency from settings if targetCurrency not provided.
 * 2. (Impure Effect) Fetch holdings snapshot & KPIs from ports.
 * 3. (Pure Transformation) Calculate real-time unrealized PnL & return DTO.
 */
export class GetPortfolioSummaryUseCase {
  private readonly portfolioAnalyticsPort: IPortfolioAnalyticsPort;
  private readonly userSettingsPort?: IUserSettingsPort;
  private readonly metricsPort?: IMetricsPort;

  constructor(
    portfolioAnalyticsPort: IPortfolioAnalyticsPort,
    userSettingsPort?: IUserSettingsPort,
    metricsPort?: IMetricsPort,
  ) {
    this.portfolioAnalyticsPort = portfolioAnalyticsPort;
    this.userSettingsPort = userSettingsPort;
    this.metricsPort = metricsPort;
  }

  public async execute(
    req: GetPortfolioSummaryRequest = {},
  ): Promise<PortfolioSummaryResponse> {
    // 1. Impure Effect: Resolve target currency
    let currency = req.targetCurrency;
    if (!currency && this.userSettingsPort) {
      currency = (await this.userSettingsPort.getSetting('base_currency')) ?? 'USD';
    }
    currency = currency || 'USD';

    // 2. Impure Effect: Fetch holdings snapshot from port
    const rawHoldings = await this.portfolioAnalyticsPort.getHoldingsSnapshot(
      req.accountId,
      currency,
    );

    // 3. Pure Transformation: Calculate summary
    const calculatedHoldings = calculateHoldingsSummary(rawHoldings, req.livePrices);

    const holdings: PortfolioHoldingDto[] = calculatedHoldings.map((h) => ({
      id: h.assetId,
      symbol: h.symbol,
      amount: h.totalQty,
      avg_price_fiat: h.avgUnitCost,
      cost_basis_fiat: h.totalCostFiat,
      live_price: h.livePrice,
      current_value_fiat: h.currentValueFiat,
      unrealized_pnl_fiat: h.unrealizedPnlFiat,
      currency: h.currency,
      portfolio_locations: h.portfolioLocations ?? [],
    }));

    // 4. Fetch metrics KPIs if metricsPort is available
    let metrics: PortfolioSummaryMetricsDto;
    if (this.metricsPort) {
      const kpis = await this.metricsPort.getKpis(currency);
      metrics = {
        total_equity_fiat: kpis.totalEquity,
        total_cost_basis_fiat: kpis.totalCostBasis,
        total_realized_pnl_fiat: kpis.totalRealizedPnl,
        total_unrealized_pnl_fiat: kpis.totalUnrealizedPnl,
        total_pnl_fiat: kpis.totalUnrealizedPnl,
        currency: kpis.currency,
      };
    } else {
      metrics = {
        total_equity_fiat: '0.00',
        total_cost_basis_fiat: '0.00',
        total_realized_pnl_fiat: '0.00',
        total_unrealized_pnl_fiat: '0.00',
        total_pnl_fiat: '0.00',
        currency,
      };
    }

    return { metrics, holdings };
  }
}
