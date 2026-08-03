import { describe, it, expect, vi } from 'vitest';
import { GetSpanishTaxReportUseCase } from '../GetSpanishTaxReportUseCase.js';
import type { ITaxCalculatorPort } from '../../../domain/ports/ITaxCalculatorPort.js';
import type { TaxLotEventType } from '@kryptofolio/shared-types';

const BASE_EVENT: TaxLotEventType = {
  id: 'evt-2024-1',
  tax_lot_id: 'lot-1',
  spot_transaction_id: 'tx-1',
  account_id: 'acc-1',
  disposal_date: '2024-05-10T10:00:00Z',
  amount_from_lot: '0.5',
  sale_price_fiat: '20000.00',
  gain_loss_fiat: '1000.00',
  fiat_currency: 'EUR',
  is_taxable: true,
  disposal_type: 'SELL',
  asset_symbol: 'BTC',
  exchange_name: 'Binance',
};

function makePort(
  events: TaxLotEventType[],
  base: Partial<{
    savingsBaseYields: string;
    generalBaseAirdrops: string;
    spotCapitalGains: string;
    excludedFlaggedEvents: number;
  }> = {},
): ITaxCalculatorPort {
  return {
    getSpanishTaxReport: vi.fn().mockResolvedValue({
      year: 2024,
      savingsBaseYields: '0.00',
      generalBaseAirdrops: '0.00',
      spotCapitalGains: '0.00',
      excludedFlaggedEvents: 0,
      ...base,
    }),
    calculateLotsAndEvents: vi.fn().mockResolvedValue({ lots: [], events }),
    calculateCustodyEntries: vi.fn().mockResolvedValue([]),
    getLotCustodyLocations: vi.fn().mockResolvedValue([]),
    getDataQuality: vi.fn().mockResolvedValue([]),
  };
}

describe('[Strict Hexagonal] GetSpanishTaxReportUseCase', () => {
  it('should fetch bases, filter events by fiscal year, and calculate AEAT summary with 19% IRPF', async () => {
    const mockTaxCalculatorPort: ITaxCalculatorPort = {
      getSpanishTaxReport: vi.fn().mockResolvedValue({
        year: 2024,
        savingsBaseYields: '100.00',
        generalBaseAirdrops: '50.00',
        spotCapitalGains: '1000.00',
        excludedFlaggedEvents: 0,
      }),
      calculateCustodyEntries: vi.fn().mockResolvedValue([]),
      getLotCustodyLocations: vi.fn().mockResolvedValue([]),
      getDataQuality: vi.fn().mockResolvedValue([]),
      calculateLotsAndEvents: vi.fn().mockResolvedValue({
        lots: [],
        events: [
          {
            id: 'evt-2024-1',
            tax_lot_id: 'lot-1',
            spot_transaction_id: 'tx-1',
            account_id: 'acc-1',
            disposal_date: '2024-05-10T10:00:00Z',
            amount_from_lot: '0.5',
            sale_price_fiat: '20000.00',
            gain_loss_fiat: '1000.00',
            fiat_currency: 'EUR',
            is_taxable: true,
            disposal_type: 'SELL',
            asset_symbol: 'BTC',
            exchange_name: 'Binance',
          },
          {
            id: 'evt-2023-1',
            tax_lot_id: 'lot-2',
            spot_transaction_id: 'tx-2',
            account_id: 'acc-1',
            disposal_date: '2023-11-15T10:00:00Z',
            amount_from_lot: '1.0',
            sale_price_fiat: '1500.00',
            gain_loss_fiat: '200.00',
            fiat_currency: 'EUR',
            is_taxable: true,
            disposal_type: 'SELL',
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

  it('reports an unresolved disposal price as null rather than as the string "null"', async () => {
    const useCase = new GetSpanishTaxReportUseCase(
      makePort([
        {
          ...BASE_EVENT,
          sale_price_fiat: null,
          gain_loss_fiat: null,
          is_taxable: false,
          quality_flag: 'MISSING_PRICE',
        },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail).toHaveLength(1);
    expect(result.audit_trail[0].sale_price_eur).toBeNull();
    expect(result.audit_trail[0].gain_loss_eur).toBeNull();
  });

  it('keeps an excluded event in the audit trail with its flag and exclusion stated', async () => {
    const useCase = new GetSpanishTaxReportUseCase(
      makePort(
        [
          {
            ...BASE_EVENT,
            sale_price_fiat: null,
            gain_loss_fiat: null,
            is_taxable: false,
            quality_flag: 'MISSING_PRICE',
          },
        ],
        { excludedFlaggedEvents: 1 },
      ),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail[0].is_taxable).toBe(false);
    expect(result.audit_trail[0].quality_flag).toBe('MISSING_PRICE');
    expect(result.excludedFlaggedEvents).toBe(1);
  });

  it('does not let an unresolved price contribute to the declared base', async () => {
    const useCase = new GetSpanishTaxReportUseCase(
      makePort([
        { ...BASE_EVENT, sale_price_fiat: null, gain_loss_fiat: null, is_taxable: false },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.summary.capital_gains_eur).toBe(0);
    expect(result.summary.net_patrimonial_result_eur).toBe(0);
  });

  it('reports each disposal provenance instead of a universal sale label', async () => {
    const useCase = new GetSpanishTaxReportUseCase(
      makePort([
        { ...BASE_EVENT, id: 'evt-fee', disposal_type: 'FEE' },
        { ...BASE_EVENT, id: 'evt-swap', disposal_type: 'SWAP' },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail.map((row) => row.operation_type)).toEqual(['FEE', 'SWAP']);
  });

  it('marks a manually assigned figure and counts how many there are', async () => {
    const useCase = new GetSpanishTaxReportUseCase(
      makePort([
        { ...BASE_EVENT, id: 'evt-manual', value_provenance: 'MANUAL', notes: 'broker statement' },
        { ...BASE_EVENT, id: 'evt-market', value_provenance: 'MARKET' },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail[0].value_provenance).toBe('MANUAL');
    expect(result.audit_trail[0].notes).toBe('broker statement');
    expect(result.manuallyAssignedCount).toBe(1);
  });
});