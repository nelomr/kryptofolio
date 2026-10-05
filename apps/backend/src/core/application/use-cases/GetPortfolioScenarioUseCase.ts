import {
  applyShock,
  breakevenPrice,
  concentrationOf,
  positionValueAt,
  type BreakevenOutcome,
  type ConcentrationOutcome,
  type PositionValueOutcome,
  type ScenarioHolding,
  type ShockInput,
  type ShockOutcome,
} from '@kryptofolio/core-domain';
import { isConvertible } from '@kryptofolio/shared-types';
import type { GetPortfolioSummaryUseCase, PortfolioHoldingDto } from './GetPortfolioSummaryUseCase.js';

export interface ScenarioScope {
  targetCurrency: string;
  livePrices?: Map<string, string>;
}

/** Every figure is in the summary's currency, so each outcome states it. */
type InCurrency<T> = T & { currency: string };

/**
 * A holding is valued only when it has a current value and its cost basis converts, the same
 * predicate the portfolio summary applies, so a scenario never sees a value the summary would hide.
 */
function toScenarioHolding(holding: PortfolioHoldingDto): ScenarioHolding {
  const resolved = isConvertible(holding.cost_basis) ? holding.current_value_fiat : undefined;
  return {
    symbol: holding.symbol,
    quantity: holding.amount,
    costBasisFiat: holding.cost_basis_fiat,
    costBasis: holding.cost_basis,
    ...(resolved === undefined ? {} : { currentValue: resolved }),
  };
}

/**
 * Functional sandwich: read the whole portfolio, hand it to a pure function, return the outcome.
 * The what-if arithmetic lives in core-domain; this class only maps and delegates.
 */
export class GetPortfolioScenarioUseCase {
  private readonly portfolioSummary: Pick<GetPortfolioSummaryUseCase, 'execute'>;

  constructor(portfolioSummary: Pick<GetPortfolioSummaryUseCase, 'execute'>) {
    this.portfolioSummary = portfolioSummary;
  }

  private async read(scope: ScenarioScope): Promise<{ holdings: ScenarioHolding[]; currency: string }> {
    const response = await this.portfolioSummary.execute({
      targetCurrency: scope.targetCurrency,
      livePrices: scope.livePrices,
    });
    return { holdings: response.holdings.map(toScenarioHolding), currency: response.metrics.currency };
  }

  async positionValue(
    request: ScenarioScope & { symbol: string; hypotheticalPrice: string },
  ): Promise<InCurrency<PositionValueOutcome>> {
    const { holdings, currency } = await this.read(request);
    return { ...positionValueAt(holdings, request.symbol, request.hypotheticalPrice), currency };
  }

  async breakeven(request: ScenarioScope & { symbol: string }): Promise<InCurrency<BreakevenOutcome>> {
    const { holdings, currency } = await this.read(request);
    return { ...breakevenPrice(holdings, request.symbol), currency };
  }

  async portfolioShock(request: ScenarioScope & { shock: ShockInput }): Promise<InCurrency<ShockOutcome>> {
    const { holdings, currency } = await this.read(request);
    return { ...applyShock(holdings, request.shock), currency };
  }

  async concentration(request: ScenarioScope): Promise<InCurrency<ConcentrationOutcome>> {
    const { holdings, currency } = await this.read(request);
    return { ...concentrationOf(holdings), currency };
  }
}
