import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';

export interface GetTokenHistoryRequest {
  symbol: string;
  accountId?: string;
}

export interface TokenLotDto {
  id: string;
  symbol: string;
  date: string;
  exchange: string;
  original_qty: number;
  remaining_qty: number;
  unit_cost: number;
  total_cost: number;
  status: 'FULL' | 'PARTIAL' | 'EMPTY';
}

export interface TokenLotHistoryEventDto {
  id: string;
  disposal_date: string;
  amount_from_lot: number;
  sale_price_eur: number;
  gain_loss_eur: number;
  sale_fee_eur?: number;
  is_taxable: boolean;
  flag?: string | null;
  notes?: string;
  asset_symbol?: string;
  exchange_name?: string;
  operation_type?: string;
}

export interface GetTokenHistoryResponse {
  lots: TokenLotDto[];
  history: Record<string, TokenLotHistoryEventDto[]>;
}

export class GetTokenHistoryUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;

  constructor(taxCalculatorPort: ITaxCalculatorPort) {
    this.taxCalculatorPort = taxCalculatorPort;
  }

  public async execute(req: GetTokenHistoryRequest): Promise<GetTokenHistoryResponse> {
    const { symbol, accountId } = req;
    const symbolUpper = symbol.toUpperCase();

    const { lots, events } = await this.taxCalculatorPort.calculateLotsAndEvents(accountId);

    const targetLots = lots.filter(
      (l) =>
        (l.symbol && l.symbol.toUpperCase() === symbolUpper) ||
        (l.asset_id && l.asset_id.toUpperCase() === symbolUpper)
    );

    const lotDtos: TokenLotDto[] = targetLots.map((lot) => {
      const originalQty = Number(lot.original_qty);
      const remainingQty = Number(lot.remaining_qty);
      let status: 'FULL' | 'PARTIAL' | 'EMPTY' = 'FULL';
      if (remainingQty <= 0) {
        status = 'EMPTY';
      } else if (remainingQty < originalQty) {
        status = 'PARTIAL';
      }

      return {
        id: lot.id || lot.spot_transaction_id,
        symbol: lot.symbol || lot.asset_id,
        date: lot.acquisition_timestamp,
        exchange: lot.exchange_location || 'Unknown',
        original_qty: originalQty,
        remaining_qty: remainingQty,
        unit_cost: Number(lot.unit_cost_fiat),
        total_cost: Number(lot.total_cost_fiat),
        status,
      };
    });

    const targetLotIds = new Set(targetLots.map((l) => l.id).filter(Boolean));

    const historyMap: Record<string, TokenLotHistoryEventDto[]> = {};

    for (const evt of events) {
      const isMatch =
        (evt.tax_lot_id && targetLotIds.has(evt.tax_lot_id)) ||
        (evt.asset_symbol && evt.asset_symbol.toUpperCase() === symbolUpper);

      if (isMatch) {
        const lotIdKey = evt.tax_lot_id || 'unknown_lot';
        if (!historyMap[lotIdKey]) {
          historyMap[lotIdKey] = [];
        }

        historyMap[lotIdKey].push({
          id: evt.id || `evt-${evt.tax_lot_id}-${evt.disposal_date}`,
          disposal_date: evt.disposal_date,
          amount_from_lot: Number(evt.amount_from_lot),
          sale_price_eur: Number(evt.sale_price_fiat),
          gain_loss_eur: Number(evt.gain_loss_fiat),
          is_taxable: Boolean(evt.is_taxable),
          flag: evt.flag ?? null,
          notes: evt.notes ?? undefined,
          asset_symbol: evt.asset_symbol || symbolUpper,
          exchange_name: evt.exchange_name || 'Exchange',
          operation_type: 'SELL',
        });
      }
    }

    return {
      lots: lotDtos,
      history: historyMap,
    };
  }
}
