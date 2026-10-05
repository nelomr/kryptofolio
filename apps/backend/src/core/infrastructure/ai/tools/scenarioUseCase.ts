import type { GetPortfolioScenarioUseCase } from '../../../application/use-cases/GetPortfolioScenarioUseCase.js';

/** The four scenario tools are thin wrappers over one method each of the same use case. */
export type PortfolioScenarioUseCaseLike = Pick<
  GetPortfolioScenarioUseCase,
  'positionValue' | 'breakeven' | 'portfolioShock' | 'concentration'
>;
