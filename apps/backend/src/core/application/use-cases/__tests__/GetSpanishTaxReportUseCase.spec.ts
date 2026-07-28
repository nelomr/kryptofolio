import { describe, it, expect, vi } from 'vitest';
import { GetSpanishTaxReportUseCase } from '../GetSpanishTaxReportUseCase.js';
import type { ITaxCalculatorPort } from '../../../domain/ports/ITaxCalculatorPort.js';
import Decimal from 'decimal.js';

describe('[Strict Hexagonal] GetSpanishTaxReportUseCase', () => {
  it('should fetch bases, filter events by fiscal year, and calculate AEAT summary with 19% IRPF', async () => {
    const mockTaxCalculatorPort: ITaxCalculatorPort = {
      getSpanishTaxReport: vi.fn().mockResolvedValue({
        year: 2024,
        savingsBaseYields: '100.00',
        generalBaseAirdrops: '50.00',
        spotCapitalGains: '1000.00',
      }),
      calculateLotsAndEvents: vi.fn().mockResolvedValue({
        lots: [],
        events: [
          {
            id: 'evt-2024-1',
            tax_lot_id: 'lot-1',
            spot_transaction_id: 'tx-1',
            account_id: 'acc-1',
            disposal_date: '2024-05-10T10:00:00Z',
            amount_from_lot: new Decimal('0.5'),
            sale_price_fiat: new Decimal('20000.00'),
            gain_loss_fiat: new Decimal('1000.00'),
            fiat_currency: 'EUR',
            is_taxable: true,
            asset_symbol: 'BTC',
            exchange_name: 'Binance',
          },
          {
            id: 'evt-2023-1',
            tax_lot_id: 'lot-2',
            spot_transaction_id: 'tx-2',
            account_id: 'acc-1',
            disposal_date: '2023-11-15T10:00:00Z',
            amount_from_lot: new Decimal('1.0'),
            sale_price_fiat: new Decimal('1500.00'),
            gain_loss_fiat: new Decimal('200.00'),
            fiat_currency: 'EUR',
            is_taxable: true,
            asset_symbol: 'ETH',
            exchange_name: 'Kraken',
          },
        ],
      }),
    };

    const useCase = new GetSpanishTaxReportUseCase(mockTaxCalculatorPort);

    const result = await useCase.execute({ year: 2024, method: 'FIFO' });

    expect(result.year).toBe(2024);
    expect(result.method).toBe('FIFO');
    expect(result.summary).toEqual({
      capital_gains_eur: 1000,
      capital_losses_eur: 0,
      savings_base_yields_eur: 100,
      general_base_airdrops_eur: 50,
      net_patrimonial_result_eur: 1150,
      estimated_irpf_eur: 218.5, // 1150 * 0.19
    });

    // Verify event filtering by fiscal year
    expect(result.audit_trail).toHaveLength(1);
    expect(result.audit_trail[0].id).toBe('evt-2024-1');
    expect(result.audit_trail[0].asset_symbol).toBe('BTC');
    expect(result.audit_trail[0].exchange_name).toBe('Binance');
  });
});
