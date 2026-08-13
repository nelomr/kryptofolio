import { describe, it, expect, vi } from 'vitest';
import { GetSpanishTaxReportUseCase } from '../GetSpanishTaxReportUseCase.js';
import type {
  ConvertedDisposalEvent,
  ITaxCalculatorPort,
} from '../../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
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

/**
 * The settings port the use case resolves its display currency through. Returning null exercises
 * the EUR fallback, which is the currency an IRPF return can actually be filed in.
 */
const settingsPort: IUserSettingsPort = {
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn(),
};

const makeUseCase = (port: ITaxCalculatorPort): GetSpanishTaxReportUseCase =>
  new GetSpanishTaxReportUseCase(port, settingsPort);

/**
 * The converted read, derived from the same native events each case declares.
 *
 * These fixtures are denominated in EUR and the use case resolves EUR, so every figure takes the
 * identity arm — `NATIVE`, never `CONVERTED` at a rate of one. Deriving it here rather than writing a
 * second fixture keeps each test's intent expressed once.
 */
function toConvertedEvents(events: TaxLotEventType[]): ConvertedDisposalEvent[] {
  return events.map((evt) => ({
    id: evt.id ?? 'evt-unknown',
    taxLotId: evt.tax_lot_id,
    disposalDate: evt.disposal_date,
    amountFromLot: String(evt.amount_from_lot),
    salePrice:
      evt.sale_price_fiat === null || evt.sale_price_fiat === undefined
        ? null
        : { kind: 'NATIVE', amount: String(evt.sale_price_fiat), currency: 'EUR' },
    gainLoss:
      evt.gain_loss_fiat === null || evt.gain_loss_fiat === undefined
        ? null
        : { kind: 'NATIVE', amount: String(evt.gain_loss_fiat), currency: 'EUR' },
    isTaxable: Boolean(evt.is_taxable),
    disposalType: evt.disposal_type,
    flag: evt.flag ?? null,
    qualityFlag: evt.quality_flag ?? null,
    valueProvenance: evt.value_provenance,
    fxRate: evt.fx_rate === null || evt.fx_rate === undefined ? null : String(evt.fx_rate),
    fxRateDate: evt.fx_rate_date ?? null,
    notes: evt.notes ?? undefined,
    assetSymbol: evt.asset_symbol,
    exchangeName: evt.exchange_name,
  }));
}

function makePort(
  events: TaxLotEventType[],
  base: Partial<{
    savingsBaseYields: string;
    generalBaseAirdrops: string;
    spotCapitalGains: string;
    excludedFlaggedEvents: number;
    excludedUnresolvedIncomeCount: number;
  }> = {},
): ITaxCalculatorPort {
  return {
    getSpanishTaxReport: vi.fn().mockResolvedValue({
      year: 2024,
      savingsBaseYields: '0.00',
      generalBaseAirdrops: '0.00',
      spotCapitalGains: '0.00',
      excludedFlaggedEvents: 0,
      excludedUnresolvedIncomeCount: 0,
      currency: 'EUR',
      conversion: { kind: 'NATIVE' },
      unconvertibleEvents: [],
      ...base,
    }),
    calculateLotsAndEvents: vi.fn().mockResolvedValue({ lots: [], events }),
    getConvertedDisposalEvents: vi.fn().mockResolvedValue(toConvertedEvents(events)),
    calculateCustodyEntries: vi.fn().mockResolvedValue([]),
    getLotCustodyLocations: vi.fn(),
    getLotCustodyTimeline: vi.fn().mockResolvedValue([]),
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
        currency: 'EUR',
        conversion: { kind: 'NATIVE' },
        unconvertibleEvents: [],
      }),
      calculateCustodyEntries: vi.fn().mockResolvedValue([]),
      getLotCustodyLocations: vi.fn(),
      getLotCustodyTimeline: vi.fn().mockResolvedValue([]),
      getDataQuality: vi.fn().mockResolvedValue([]),
      getConvertedDisposalEvents: vi.fn().mockResolvedValue(
        toConvertedEvents([
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
          } as TaxLotEventType,
        ]),
      ),
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

    const useCase = makeUseCase(mockTaxCalculatorPort);

    const result = await useCase.execute({ year: 2024, method: 'FIFO' });

    expect(result.year).toBe(2024);
    expect(result.method).toBe('FIFO');
    // Exact decimal strings, and the field names carry no currency: the summary is derived from
    // bases already converted to the display currency, so a `_eur` name held dollars in a USD report.
    expect(result.summary).toEqual({
      capital_gains: '1000',
      capital_losses: '0',
      savings_base_yields: '100',
      general_base_airdrops: '50',
      net_patrimonial_result: '1150',
      estimated_irpf: '218.5', // 1150 * 0.19, exact in decimal
    });

    // Verify event filtering by fiscal year
    expect(result.audit_trail).toHaveLength(1);
    expect(result.audit_trail[0].id).toBe('evt-2024-1');
    expect(result.audit_trail[0].asset_symbol).toBe('BTC');
    expect(result.audit_trail[0].exchange_name).toBe('Binance');
  });

  it('reports an unresolved disposal price as null rather than as the string "null"', async () => {
    const useCase = makeUseCase(
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
    expect(result.audit_trail[0].sale_price).toBeNull();
    expect(result.audit_trail[0].gain_loss).toBeNull();
  });

  it('carries fx_rate and fx_rate_date when a conversion occurred', async () => {
    const useCase = makeUseCase(
      makePort([
        {
          ...BASE_EVENT,
          fx_rate: '1.09',
          fx_rate_date: '2024-03-01',
          value_provenance: 'MARKET_CONVERTED',
        },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail).toHaveLength(1);
    expect(result.audit_trail[0].fx_rate).toBe('1.09');
    expect(result.audit_trail[0].fx_rate_date).toBe('2024-03-01');
    expect(result.audit_trail[0].value_provenance).toBe('MARKET_CONVERTED');
  });

  it('carries the unresolved-income count from the port to the response untouched', async () => {
    const useCase = makeUseCase(
      makePort([], { excludedUnresolvedIncomeCount: 3 }),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.excludedUnresolvedIncomeCount).toBe(3);
  });

  it('keeps an excluded event in the audit trail with its flag and exclusion stated', async () => {
    const useCase = makeUseCase(
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
    const useCase = makeUseCase(
      makePort([
        { ...BASE_EVENT, sale_price_fiat: null, gain_loss_fiat: null, is_taxable: false },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    // Exact strings now, not floats: a declared tax base is the last figure that should be a float.
    expect(result.summary.capital_gains).toBe('0');
    expect(result.summary.net_patrimonial_result).toBe('0');
  });

  it('reports each disposal provenance instead of a universal sale label', async () => {
    const useCase = makeUseCase(
      makePort([
        { ...BASE_EVENT, id: 'evt-fee', disposal_type: 'FEE' },
        { ...BASE_EVENT, id: 'evt-swap', disposal_type: 'SWAP' },
      ]),
    );

    const result = await useCase.execute({ year: 2024 });

    expect(result.audit_trail.map((row) => row.operation_type)).toEqual(['FEE', 'SWAP']);
  });

  it('marks a manually assigned figure and counts how many there are', async () => {
    const useCase = makeUseCase(
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