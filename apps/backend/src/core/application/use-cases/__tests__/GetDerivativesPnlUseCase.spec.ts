import { describe, it, expect, vi } from 'vitest';
import { GetDerivativesPnlUseCase } from '../GetDerivativesPnlUseCase.js';
import type { DerivativesPnl, IPortfolioAnalyticsPort } from '../../../domain/ports/IPortfolioAnalyticsPort.js';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';

const PNL: DerivativesPnl[] = [
  { symbol: 'PF_XBTUSD', contractName: 'PF_XBTUSD', realizedPnl: '10', funding: '1', fees: '2', netPnl: '9', currency: 'USD' },
];

function build() {
  const order: string[] = [];
  const freshness = {
    ensureFresh: vi.fn(async () => {
      order.push('ensureFresh');
    }),
  } as unknown as FifoChainFreshnessService;
  const port = {
    getDerivativesPnl: vi.fn(async () => {
      order.push('getDerivativesPnl');
      return PNL;
    }),
  } as unknown as IPortfolioAnalyticsPort;
  return { useCase: new GetDerivativesPnlUseCase(port, freshness), port, order };
}

describe('GetDerivativesPnlUseCase', () => {
  it('reads every account in the requested currency, after the freshness gate', async () => {
    const { useCase, port, order } = build();

    const result = await useCase.execute('EUR');

    expect(result).toEqual(PNL);
    expect(port.getDerivativesPnl).toHaveBeenCalledWith(undefined, 'EUR');
    expect(order).toEqual(['ensureFresh', 'getDerivativesPnl']);
  });
});
