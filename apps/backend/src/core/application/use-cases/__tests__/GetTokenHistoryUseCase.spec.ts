import { describe, it, expect, vi } from 'vitest';
import { GetTokenHistoryUseCase } from '../GetTokenHistoryUseCase.js';
import type { ITaxCalculatorPort } from '../../../domain/ports/ITaxCalculatorPort.js';
import Decimal from 'decimal.js';

describe('[Strict Hexagonal] GetTokenHistoryUseCase', () => {
  it('should filter lots and lot history events by symbol and format DTO response correctly', async () => {
    const mockTaxCalculatorPort: ITaxCalculatorPort = {
      getSpanishTaxReport: vi.fn(),
      calculateLotsAndEvents: vi.fn().mockResolvedValue({
        lots: [
          {
            id: 'lot-xlm-1',
            spot_transaction_id: 'tx-1',
            asset_id: 'XLM',
            symbol: 'XLM',
            account_id: 'acc-1',
            original_qty: new Decimal('2000.0'),
            remaining_qty: new Decimal('1573.45'),
            unit_cost_fiat: new Decimal('0.10'),
            total_cost_fiat: new Decimal('200.00'),
            fiat_currency: 'EUR',
            acquisition_timestamp: '2024-01-10T10:00:00Z',
            exchange_location: 'Binance',
            status: 'PARTIAL',
          },
          {
            id: 'lot-btc-1',
            spot_transaction_id: 'tx-2',
            asset_id: 'BTC',
            symbol: 'BTC',
            account_id: 'acc-1',
            original_qty: new Decimal('1.0'),
            remaining_qty: new Decimal('1.0'),
            unit_cost_fiat: new Decimal('40000.00'),
            total_cost_fiat: new Decimal('40000.00'),
            fiat_currency: 'EUR',
            acquisition_timestamp: '2024-02-15T10:00:00Z',
            exchange_location: 'Kraken',
            status: 'FULL',
          },
        ],
        events: [
          {
            id: 'evt-1',
            tax_lot_id: 'lot-xlm-1',
            spot_transaction_id: 'tx-3',
            account_id: 'acc-1',
            disposal_date: '2024-06-01T12:00:00Z',
            amount_from_lot: new Decimal('426.55'),
            sale_price_fiat: new Decimal('0.15'),
            gain_loss_fiat: new Decimal('21.3275'),
            fiat_currency: 'EUR',
            is_taxable: true,
            asset_symbol: 'XLM',
            exchange_name: 'Binance',
          },
        ],
      }),
    };

    const useCase = new GetTokenHistoryUseCase(mockTaxCalculatorPort);

    const result = await useCase.execute({ symbol: 'XLM' });

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].id).toBe('lot-xlm-1');
    expect(result.lots[0].symbol).toBe('XLM');
    expect(result.lots[0].original_qty).toBe(2000.0);
    expect(result.lots[0].remaining_qty).toBe(1573.45);
    expect(result.lots[0].status).toBe('PARTIAL');

    expect(result.history['lot-xlm-1']).toHaveLength(1);
    expect(result.history['lot-xlm-1'][0].id).toBe('evt-1');
    expect(result.history['lot-xlm-1'][0].amount_from_lot).toBe(426.55);
    expect(result.history['lot-xlm-1'][0].asset_symbol).toBe('XLM');
  });
});
