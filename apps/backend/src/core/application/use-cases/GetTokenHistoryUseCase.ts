import type {
  ITaxCalculatorPort,
  LotCustodyLocationRow,
} from '../../domain/ports/ITaxCalculatorPort.js';
import type {
  DisposalType,
  FifoQualityFlag,
  FiscalClassificationFlag,
  ManualValueProvenance,
  TaxLotStatus,
} from '@kryptofolio/shared-types';

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
  status: TaxLotStatus;
  /** Where the quantity sits now. Empty when nothing has moved and the projection has no row. */
  custody: TokenLotCustodyDto[];
}

export interface TokenLotCustodyDto {
  account_id: string;
  account_name: string;
  is_synthetic: boolean;
  parent_account_id: string | null;
  qty: number;
}

export interface TokenLotHistoryEventDto {
  id: string;
  disposal_date: string;
  amount_from_lot: number;
  /** Null when no price could be resolved. Never coerced to `0`, which reads as a free disposal. */
  sale_price_eur: number | null;
  gain_loss_eur: number | null;
  sale_fee_eur?: number;
  is_taxable: boolean;
  flag?: FiscalClassificationFlag | null;
  quality_flag?: FifoQualityFlag | null;
  value_provenance?: ManualValueProvenance;
  notes?: string;
  asset_symbol?: string;
  exchange_name?: string;
  operation_type: DisposalType;
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

    const [{ lots, events }, custodyLocations] = await Promise.all([
      this.taxCalculatorPort.calculateLotsAndEvents(accountId),
      this.taxCalculatorPort.getLotCustodyLocations(accountId),
    ]);

    const custodyByLot = groupCustodyByLot(custodyLocations);

    const targetLots = lots.filter(
      (l) =>
        (l.symbol && l.symbol.toUpperCase() === symbolUpper) ||
        (l.asset_id && l.asset_id.toUpperCase() === symbolUpper)
    );

    const lotDtos: TokenLotDto[] = targetLots.map((lot) => {
      const lotId = lot.id || lot.spot_transaction_id;

      return {
        id: lotId,
        symbol: lot.symbol || lot.asset_id,
        date: lot.acquisition_timestamp,
        exchange: lot.exchange_location || 'Unknown',
        original_qty: Number(lot.original_qty),
        remaining_qty: Number(lot.remaining_qty),
        unit_cost: Number(lot.unit_cost_fiat),
        total_cost: Number(lot.total_cost_fiat),
        status: lot.status,
        custody: custodyByLot.get(lotId) ?? [],
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
          sale_price_eur: evt.sale_price_fiat === null ? null : Number(evt.sale_price_fiat),
          gain_loss_eur: evt.gain_loss_fiat === null ? null : Number(evt.gain_loss_fiat),
          is_taxable: Boolean(evt.is_taxable),
          flag: evt.flag ?? null,
          quality_flag: evt.quality_flag ?? null,
          value_provenance: evt.value_provenance,
          notes: evt.notes ?? undefined,
          asset_symbol: evt.asset_symbol || symbolUpper,
          exchange_name: evt.exchange_name || 'Exchange',
          operation_type: evt.disposal_type,
        });
      }
    }

    return {
      lots: lotDtos,
      history: historyMap,
    };
  }
}

/**
 * An account whose net holding of a lot is zero is not a location — it either never held the
 * quantity or has since sent all of it on, and the projection reports both as a zero row.
 */
function groupCustodyByLot(
  rows: readonly LotCustodyLocationRow[],
): Map<string, TokenLotCustodyDto[]> {
  const byLot = new Map<string, TokenLotCustodyDto[]>();

  for (const row of rows) {
    const qty = Number(row.qty);
    if (qty === 0) continue;

    const existing = byLot.get(row.tax_lot_id) ?? [];
    existing.push({
      account_id: row.account_id,
      account_name: row.account_name,
      is_synthetic: row.is_synthetic,
      parent_account_id: row.parent_account_id,
      qty,
    });
    byLot.set(row.tax_lot_id, existing);
  }

  return byLot;
}
