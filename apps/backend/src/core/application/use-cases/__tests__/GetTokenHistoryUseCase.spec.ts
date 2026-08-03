import { describe, it, expect, vi } from 'vitest';
import { GetTokenHistoryUseCase } from '../GetTokenHistoryUseCase.js';
import type {
  ITaxCalculatorPort,
  LotCustodyLocationRow,
} from '../../../domain/ports/ITaxCalculatorPort.js';
import type { TaxLotType, TaxLotEventType } from '@kryptofolio/shared-types';

function makePort(data: {
  lots?: TaxLotType[];
  events?: TaxLotEventType[];
  custody?: LotCustodyLocationRow[];
}): ITaxCalculatorPort {
  return {
    getSpanishTaxReport: vi.fn(),
    calculateLotsAndEvents: vi
      .fn()
      .mockResolvedValue({ lots: data.lots ?? [], events: data.events ?? [] }),
    calculateCustodyEntries: vi.fn().mockResolvedValue([]),
    getLotCustodyLocations: vi.fn().mockResolvedValue(data.custody ?? []),
    getDataQuality: vi.fn().mockResolvedValue([]),
  };
}

const XLM_LOT: TaxLotType = {
  id: 'lot-xlm-1',
  spot_transaction_id: 'tx-1',
  asset_id: 'XLM',
  symbol: 'XLM',
  account_id: 'acc-1',
  original_qty: '2000.0',
  remaining_qty: '1573.45',
  unit_cost_fiat: '0.10',
  total_cost_fiat: '200.00',
  fiat_currency: 'EUR',
  acquisition_timestamp: '2024-01-10T10:00:00Z',
  exchange_location: 'Binance',
  status: 'PARTIAL',
};

const XLM_EVENT: TaxLotEventType = {
  id: 'evt-1',
  tax_lot_id: 'lot-xlm-1',
  spot_transaction_id: 'tx-3',
  account_id: 'acc-1',
  disposal_date: '2024-06-01T12:00:00Z',
  amount_from_lot: '426.55',
  sale_price_fiat: '0.15',
  gain_loss_fiat: '21.3275',
  fiat_currency: 'EUR',
  is_taxable: true,
  disposal_type: 'SELL',
  asset_symbol: 'XLM',
  exchange_name: 'Binance',
};

describe('[Strict Hexagonal] GetTokenHistoryUseCase', () => {
  it('should filter lots and lot history events by symbol and format DTO response correctly', async () => {
    const port = makePort({
      lots: [
        XLM_LOT,
        {
          id: 'lot-btc-1',
          spot_transaction_id: 'tx-2',
          asset_id: 'BTC',
          symbol: 'BTC',
          account_id: 'acc-1',
          original_qty: '1.0',
          remaining_qty: '1.0',
          unit_cost_fiat: '40000.00',
          total_cost_fiat: '40000.00',
          fiat_currency: 'EUR',
          acquisition_timestamp: '2024-02-15T10:00:00Z',
          exchange_location: 'Kraken',
          status: 'OPEN',
        },
      ],
      events: [XLM_EVENT],
    });

    const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

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

  describe('canonical lot status', () => {
    it('passes the view status through even when it contradicts the quantities', async () => {
      // A lot whose quantity was moved rather than sold keeps every unit and stays OPEN with a
      // zero balance at its acquiring account. Deriving status from quantities cannot tell the two
      // apart, which is why the view's value is authoritative.
      const port = makePort({
        lots: [{ ...XLM_LOT, remaining_qty: '0', status: 'OPEN' }],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].status).toBe('OPEN');
    });

    it('reports CLOSED for a fully consumed lot', async () => {
      const port = makePort({
        lots: [{ ...XLM_LOT, remaining_qty: '0', status: 'CLOSED' }],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].status).toBe('CLOSED');
    });

    it('reports OPEN for an untouched lot', async () => {
      const port = makePort({
        lots: [{ ...XLM_LOT, remaining_qty: '2000.0', status: 'OPEN' }],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].status).toBe('OPEN');
    });

    it('emits no lot carrying the retired FULL or EMPTY vocabulary', async () => {
      const port = makePort({
        lots: [
          { ...XLM_LOT, status: 'OPEN' },
          { ...XLM_LOT, id: 'lot-xlm-2', remaining_qty: '0', status: 'CLOSED' },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      const statuses: string[] = result.lots.map((lot) => lot.status);
      expect(statuses).not.toContain('FULL');
      expect(statuses).not.toContain('EMPTY');
    });
  });

  describe('disposal provenance', () => {
    it('reports a fee disposal as FEE, not as a sale', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        events: [{ ...XLM_EVENT, id: 'evt-fee', disposal_type: 'FEE' }],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.history['lot-xlm-1'][0].operation_type).toBe('FEE');
    });

    it('reports each disposal type as the engine derived it', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        events: [
          { ...XLM_EVENT, id: 'evt-sell', disposal_type: 'SELL' },
          { ...XLM_EVENT, id: 'evt-swap', disposal_type: 'SWAP' },
          { ...XLM_EVENT, id: 'evt-spend', disposal_type: 'SPEND' },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.history['lot-xlm-1'].map((e) => e.operation_type)).toEqual([
        'SELL',
        'SWAP',
        'SPEND',
      ]);
    });

    it('exposes the fiscal flag, the quality flag and the value provenance separately', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        events: [
          {
            ...XLM_EVENT,
            flag: 'WALLET_ACTIVATION',
            quality_flag: 'MISSING_PRICE',
            value_provenance: 'MANUAL',
          },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });
      const event = result.history['lot-xlm-1'][0];

      expect(event.flag).toBe('WALLET_ACTIVATION');
      expect(event.quality_flag).toBe('MISSING_PRICE');
      expect(event.value_provenance).toBe('MANUAL');
    });

    it('propagates an unresolved price as null instead of zero', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        events: [
          {
            ...XLM_EVENT,
            sale_price_fiat: null,
            gain_loss_fiat: null,
            is_taxable: false,
            quality_flag: 'MISSING_PRICE',
          },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });
      const event = result.history['lot-xlm-1'][0];

      expect(event.sale_price_eur).toBeNull();
      expect(event.gain_loss_eur).toBeNull();
      expect(event.is_taxable).toBe(false);
    });
  });

  describe('current custody location', () => {
    it('returns one custody row per holding account, with the synthetic marker', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        custody: [
          {
            tax_lot_id: 'lot-xlm-1',
            asset_id: 'XLM',
            account_id: 'acc-1',
            account_name: 'Binance',
            is_synthetic: false,
            parent_account_id: null,
            qty: '1073.45',
          },
          {
            tax_lot_id: 'lot-xlm-1',
            asset_id: 'XLM',
            account_id: 'ownwallet-XLM',
            account_name: 'ownwallet-XLM',
            is_synthetic: true,
            parent_account_id: null,
            qty: '500.00',
          },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].custody).toEqual([
        {
          account_id: 'acc-1',
          account_name: 'Binance',
          is_synthetic: false,
          parent_account_id: null,
          qty: 1073.45,
        },
        {
          account_id: 'ownwallet-XLM',
          account_name: 'ownwallet-XLM',
          is_synthetic: true,
          parent_account_id: null,
          qty: 500,
        },
      ]);
    });

    it('omits an account that no longer holds any part of the lot', async () => {
      const port = makePort({
        lots: [XLM_LOT],
        custody: [
          {
            tax_lot_id: 'lot-xlm-1',
            asset_id: 'XLM',
            account_id: 'acc-1',
            account_name: 'Binance',
            is_synthetic: false,
            parent_account_id: null,
            qty: '0',
          },
          {
            tax_lot_id: 'lot-xlm-1',
            asset_id: 'XLM',
            account_id: 'acc-2',
            account_name: 'Ledger',
            is_synthetic: false,
            parent_account_id: null,
            qty: '1573.45',
          },
        ],
      });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].custody.map((c) => c.account_id)).toEqual(['acc-2']);
    });

    it('returns an empty custody list for a lot the projection knows nothing about', async () => {
      const port = makePort({ lots: [XLM_LOT], custody: [] });

      const result = await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM' });

      expect(result.lots[0].custody).toEqual([]);
    });

    it('scopes the custody query to the requested account', async () => {
      const port = makePort({ lots: [XLM_LOT] });

      await new GetTokenHistoryUseCase(port).execute({ symbol: 'XLM', accountId: 'acc-1' });

      expect(port.getLotCustodyLocations).toHaveBeenCalledWith('acc-1');
    });
  });
});
