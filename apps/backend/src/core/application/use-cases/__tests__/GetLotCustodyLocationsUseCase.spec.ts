import { describe, it, expect, vi } from 'vitest';
import { GetLotCustodyLocationsUseCase } from '../GetLotCustodyLocationsUseCase.js';
import type { ITaxCalculatorPort, LotCustodyLocationRow } from '../../../domain/ports/ITaxCalculatorPort.js';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';

const row = (overrides: Partial<LotCustodyLocationRow>): LotCustodyLocationRow => ({
  tax_lot_id: 'lot-1',
  asset_id: 'BTC',
  account_id: 'kraken',
  account_name: 'Kraken',
  is_synthetic: false,
  parent_account_id: null,
  qty: '1',
  ...overrides,
});

function build(rows: LotCustodyLocationRow[]) {
  const order: string[] = [];
  const freshness = {
    ensureFresh: vi.fn(async () => {
      order.push('ensureFresh');
    }),
  } as unknown as FifoChainFreshnessService;
  const port = {
    getLotCustodyLocations: vi.fn(async () => {
      order.push('getLotCustodyLocations');
      return rows;
    }),
  } as unknown as ITaxCalculatorPort;
  return { useCase: new GetLotCustodyLocationsUseCase(port, freshness), port, order };
}

describe('GetLotCustodyLocationsUseCase', () => {
  it('reads every account after the freshness gate and summarizes the custody rows', async () => {
    const { useCase, port, order } = build([
      row({ qty: '0.5' }),
      row({ tax_lot_id: 'lot-2', qty: '0.25' }),
      row({ account_id: 'ownwallet-BTC', account_name: 'Own Wallet BTC', is_synthetic: true }),
    ]);

    const result = await useCase.execute({});

    expect(port.getLotCustodyLocations).toHaveBeenCalledWith(undefined);
    expect(order).toEqual(['ensureFresh', 'getLotCustodyLocations']);
    expect(result.holdings).toEqual([{ symbol: 'BTC', accountName: 'Kraken', quantity: '0.75', lotCount: 2 }]);
    expect(result.syntheticRowCount).toBe(1);
  });

  it('narrows to one symbol', async () => {
    const { useCase } = build([row({}), row({ asset_id: 'ETH', qty: '2' })]);

    const result = await useCase.execute({ symbol: 'ETH' });

    expect(result.holdings.map((h) => h.symbol)).toEqual(['ETH']);
  });
});
