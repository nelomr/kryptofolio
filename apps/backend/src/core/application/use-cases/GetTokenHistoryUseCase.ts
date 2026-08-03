import type {
  ITaxCalculatorPort,
  LotCustodyLocationRow,
  LotCustodyRelocationRow,
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
  /**
   * Defect on this lot's own basis, if any.
   *
   * Load-bearing rather than informational: when it is set, `unit_cost` and `total_cost` were forced
   * to `0` by the view because the column cannot be null, so reading the figure without this field
   * turns an unresolved basis into a free acquisition.
   */
  quality_flag: FifoQualityFlag | null;
  /** Whether the basis was observed from market data or declared by the user. */
  value_provenance?: ManualValueProvenance;
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

/**
 * One relocation of a lot, for the merged Level 3 timeline.
 *
 * Carries no valuation of any kind, and cannot be widened to carry one: a movement between the
 * user's own accounts realises nothing, so there is no price, gain or loss to report.
 */
export interface TokenLotRelocationDto {
  id: string;
  occurred_at: string;
  qty: number;
  from_account_id: string;
  from_account_name: string;
  from_is_synthetic: boolean;
  to_account_id: string;
  to_account_name: string;
  to_is_synthetic: boolean;
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
  /**
   * Keyed by lot id, like `history`, and deliberately a second map rather than entries appended to
   * it: a relocation is not a `lot_history_event` and merging them on the wire would lose the
   * distinction the view has to draw.
   */
  relocations: Record<string, TokenLotRelocationDto[]>;
}

export class GetTokenHistoryUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;

  constructor(taxCalculatorPort: ITaxCalculatorPort) {
    this.taxCalculatorPort = taxCalculatorPort;
  }

  public async execute(req: GetTokenHistoryRequest): Promise<GetTokenHistoryResponse> {
    const { symbol, accountId } = req;
    const symbolUpper = symbol.toUpperCase();

    const [{ lots, events }, custodyLocations, relocations] = await Promise.all([
      this.taxCalculatorPort.calculateLotsAndEvents(accountId),
      this.taxCalculatorPort.getLotCustodyLocations(accountId),
      this.taxCalculatorPort.getLotCustodyTimeline(accountId),
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
        quality_flag: lot.quality_flag ?? null,
        value_provenance: lot.value_provenance,
        custody: custodyByLot.get(lotId) ?? [],
      };
    });

    const targetLotIds = new Set(
      targetLots.map((l) => l.id).filter((id): id is string => Boolean(id)),
    );

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
      relocations: groupRelocationsByLot(relocations, targetLotIds),
    };
  }
}

/**
 * Scoped to the lots being returned: the custody timeline is asset-wide, and a caller asking for one
 * symbol has no use for another asset's movements.
 */
function groupRelocationsByLot(
  rows: readonly LotCustodyRelocationRow[],
  lotIds: ReadonlySet<string>,
): Record<string, TokenLotRelocationDto[]> {
  const byLot: Record<string, TokenLotRelocationDto[]> = {};

  for (const row of rows) {
    if (!lotIds.has(row.tax_lot_id)) continue;

    const bucket = byLot[row.tax_lot_id] ?? [];
    bucket.push({
      id: `${row.spot_transaction_id ?? row.occurred_at}-${row.tax_lot_id}-${row.to_account_id}`,
      occurred_at: row.occurred_at,
      qty: Number(row.qty),
      from_account_id: row.from_account_id,
      from_account_name: row.from_account_name,
      from_is_synthetic: row.from_is_synthetic,
      to_account_id: row.to_account_id,
      to_account_name: row.to_account_name,
      to_is_synthetic: row.to_is_synthetic,
    });
    byLot[row.tax_lot_id] = bucket;
  }

  return byLot;
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
