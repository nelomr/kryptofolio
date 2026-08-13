import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { ConvertedAmount } from '@kryptofolio/shared-types';
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
  /** Absent means "whatever the user has configured"; resolved through the settings port, never assumed. */
  targetCurrency?: string;
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
  /**
   * The figure in the requested display currency, with its own conversion outcome.
   *
   * Null when no price was ever resolved — never coerced to `0`, which reads as a free disposal. An
   * `UNCONVERTIBLE` outcome is the different case: the figure exists and no rate reached its date.
   */
  sale_price: ConvertedAmount | null;
  gain_loss: ConvertedAmount | null;
  sale_fee?: number;
  is_taxable: boolean;
  flag?: FiscalClassificationFlag | null;
  quality_flag?: FifoQualityFlag | null;
  value_provenance?: ManualValueProvenance;
  /** The FIFO's own hop, not the display one — that rate travels inside the outcomes above. */
  fx_rate?: string | null;
  fx_rate_date?: string | null;
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
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(taxCalculatorPort: ITaxCalculatorPort, userSettingsPort: IUserSettingsPort) {
    this.taxCalculatorPort = taxCalculatorPort;
    this.userSettingsPort = userSettingsPort;
  }

  public async execute(req: GetTokenHistoryRequest): Promise<GetTokenHistoryResponse> {
    const { symbol, accountId } = req;
    const symbolUpper = symbol.toUpperCase();

    // The portfolio's default display currency, unlike the tax report's EUR: this view is a
    // portfolio reading, not a declaration, and `USD` is what the rest of the portfolio falls back to.
    const targetCurrency =
      req.targetCurrency ??
      (await this.userSettingsPort.getSetting('base_currency')) ??
      'USD';

    // `calculateLotsAndEvents` still supplies the lots, which are native by design. The disposal
    // figures a user reads come from the converted read — ALL_TIME, because a token's history is
    // defined by the token and spans every year it existed.
    const [{ lots }, convertedEvents, custodyLocations, relocations] = await Promise.all([
      this.taxCalculatorPort.calculateLotsAndEvents(accountId),
      this.taxCalculatorPort.getConvertedDisposalEvents(
        { kind: 'ALL_TIME' },
        accountId,
        targetCurrency,
      ),
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

    for (const evt of convertedEvents) {
      const isMatch =
        (evt.taxLotId && targetLotIds.has(evt.taxLotId)) ||
        (evt.assetSymbol && evt.assetSymbol.toUpperCase() === symbolUpper);

      if (isMatch) {
        const lotIdKey = evt.taxLotId || 'unknown_lot';
        if (!historyMap[lotIdKey]) {
          historyMap[lotIdKey] = [];
        }

        historyMap[lotIdKey].push({
          id: evt.id || `evt-${evt.taxLotId}-${evt.disposalDate}`,
          disposal_date: evt.disposalDate,
          amount_from_lot: Number(evt.amountFromLot),
          sale_price: evt.salePrice,
          gain_loss: evt.gainLoss,
          is_taxable: evt.isTaxable,
          flag: evt.flag,
          quality_flag: evt.qualityFlag,
          value_provenance: evt.valueProvenance,
          fx_rate: evt.fxRate,
          fx_rate_date: evt.fxRateDate,
          notes: evt.notes,
          asset_symbol: evt.assetSymbol || symbolUpper,
          exchange_name: evt.exchangeName || 'Exchange',
          operation_type: evt.disposalType,
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
