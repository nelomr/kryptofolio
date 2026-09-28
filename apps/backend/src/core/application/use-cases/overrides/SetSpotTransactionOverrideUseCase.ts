import {
  OverrideMutationUseCase,
  OverrideValidationError,
  OverrideNotFoundError,
  type OverrideMutationResult,
} from './OverrideMutation.js';
import { canRetype } from '../../../domain/services/SpotTransactionOverridePolicy.js';
import type { ILedgerPort, LedgerSpotTransactionOverride } from '../../../domain/ports/ILedgerPort.js';
import type { ITaxCalculatorPort } from '../../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';
import type { PreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import type { SpotTxType, TransactionIdHash, SpotEditBalanceCheck } from '@kryptofolio/shared-types';

// Re-exported so existing call sites (`import { SpotEditBalanceCheck } from
// './SetSpotTransactionOverrideUseCase.js'`) keep working after this type moved to its single
// source of truth in shared-types — it was duplicated here and there, structurally identical,
// which is exactly what group 1's own type is for.
export type { SpotEditBalanceCheck };

/** A field that is either left as-is, or explicitly set to a new value (rule 5). */
export type EditField<T> = { kind: 'UNCHANGED' } | { kind: 'SET'; value: T };

/** The price field's `SET` arm always carries its own currency — see shared-types' `priceFieldSchema`. */
export type PriceEditField =
  | { kind: 'UNCHANGED' }
  | { kind: 'SET'; value: PreciseAmount; fiatCurrency: string };

/** The fee group's three-way discriminant — see `spotTransactionEditSchema` in shared-types. */
export type FeeEditField =
  | { kind: 'UNCHANGED' }
  | { kind: 'NONE' }
  | { kind: 'CHARGED'; amount: PreciseAmount; assetId: string };

export interface SpotTransactionOverrideEditInput {
  idHash: TransactionIdHash;
  amountIn: EditField<PreciseAmount>;
  amountOut: EditField<PreciseAmount>;
  priceFiat: PriceEditField;
  totalFiat: EditField<PreciseAmount | null>;
  fee: FeeEditField;
  timestamp: EditField<string>;
  txType: EditField<SpotTxType>;
  note?: string;
}

export interface SpotOverrideMutationResult extends OverrideMutationResult {
  balanceCheck: SpotEditBalanceCheck;
}

function isAllUnchanged(input: SpotTransactionOverrideEditInput): boolean {
  return (
    input.amountIn.kind === 'UNCHANGED' &&
    input.amountOut.kind === 'UNCHANGED' &&
    input.priceFiat.kind === 'UNCHANGED' &&
    input.totalFiat.kind === 'UNCHANGED' &&
    input.fee.kind === 'UNCHANGED' &&
    input.timestamp.kind === 'UNCHANGED' &&
    input.txType.kind === 'UNCHANGED'
  );
}

/** `(assetId, accountId)` pairs currently flagged `UNTRACKED_INFLOW` among the given asset ids. */
async function untrackedInflowPairs(
  taxCalculatorPort: ITaxCalculatorPort,
  assetIds: ReadonlySet<string>,
): Promise<Map<string, { assetId: string; accountId: string; balance: string; tolerance: string }>> {
  const rows = await taxCalculatorPort.getDataQuality();
  const pairs = new Map<
    string,
    { assetId: string; accountId: string; balance: string; tolerance: string }
  >();
  for (const row of rows) {
    if (row.quality_flag !== 'UNTRACKED_INFLOW') continue;
    if (!row.asset_id || !row.account_id || !assetIds.has(row.asset_id)) continue;
    // Balance/tolerance are not carried by FifoDataQualityRow (it is a flag summary, not a
    // magnitude report); reported as '0' placeholders until the DuckDB view (group 6) exposes
    // them, which is the same limitation design.md D6 flags for the adapter layer.
    pairs.set(`${row.asset_id}|${row.account_id}`, {
      assetId: row.asset_id,
      accountId: row.account_id,
      balance: '0',
      tolerance: '0',
    });
  }
  return pairs;
}

export class SetSpotTransactionOverrideUseCase extends OverrideMutationUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;

  constructor(
    ledgerPort: ILedgerPort,
    userSettingsPort: IUserSettingsPort,
    freshnessService: FifoChainFreshnessService,
    taxCalculatorPort: ITaxCalculatorPort,
  ) {
    super(ledgerPort, userSettingsPort, freshnessService);
    this.taxCalculatorPort = taxCalculatorPort;
  }

  async execute(input: SpotTransactionOverrideEditInput): Promise<SpotOverrideMutationResult> {
    if (isAllUnchanged(input)) {
      throw new OverrideValidationError(
        `Edit for ${input.idHash} changes nothing; use Restore to remove an existing override instead`,
      );
    }

    const transactions = await this.ledgerPort.getSpotTransactions();
    const original = transactions.find((tx) => tx.id_hash === input.idHash);
    if (!original) {
      throw new OverrideNotFoundError(`No spot transaction found for id_hash ${input.idHash}`);
    }

    if (input.txType.kind === 'SET') {
      const allowed = canRetype(
        original.tx_type,
        input.txType.value,
        original.transfer_group_id ?? null,
      );
      if (!allowed) {
        throw new OverrideValidationError(
          `Transaction ${input.idHash} cannot be retyped from ${original.tx_type} to ` +
            `${input.txType.value}: this would cross the custody boundary. Declare a transfer ` +
            `destination instead of editing tx_type for a custody movement.`,
        );
      }
    }

    const affectedAssets = new Set<string>(
      [
        original.asset_in_id,
        original.asset_out_id,
        original.fee_asset_id,
        input.fee.kind === 'CHARGED' ? input.fee.assetId : undefined,
      ].filter((id): id is string => Boolean(id)),
    );

    const before = await untrackedInflowPairs(this.taxCalculatorPort, affectedAssets);

    // `setSpotTransactionOverride` REPLACES the whole row for this id_hash (design.md D2/9.3),
    // it does not merge — so an "UNCHANGED" field in THIS payload must be resolved against
    // whatever is already persisted, or a save that only touches one field would silently erase
    // every override a previous, separate save had set on the others. Real defect found by the
    // user: editing total_fiat alone was wiping a price override set in an earlier save, and
    // vice versa.
    const existingOverride = await this.ledgerPort.getSpotTransactionOverride(input.idHash);
    const overrideRow = toLedgerOverride(input, existingOverride ?? null);
    const result = await this.applyThenRebuild(1, async () => {
      await this.ledgerPort.setSpotTransactionOverride(overrideRow);
    });

    const after = await untrackedInflowPairs(this.taxCalculatorPort, affectedAssets);
    const newlyFlagged = [...after.entries()]
      .filter(([key]) => !before.has(key))
      .map(([, entry]) => entry);

    const balanceCheck: SpotEditBalanceCheck =
      newlyFlagged.length > 0 ? { kind: 'NEGATIVE_BALANCE', entries: newlyFlagged } : { kind: 'CLEAN' };

    return { ...result, balanceCheck };
  }
}

/**
 * Builds the full replacement row `setSpotTransactionOverride` writes. Every field an "UNCHANGED"
 * kind carries forward whatever `existing` already had for that field — the correct reading of
 * "leave it alone" when there is a prior override, and "no override" (the existing behavior) when
 * there is none.
 */
function toLedgerOverride(
  input: SpotTransactionOverrideEditInput,
  existing: LedgerSpotTransactionOverride | null,
): LedgerSpotTransactionOverride {
  return {
    id_hash: input.idHash,
    amount_in_edited: input.amountIn.kind === 'SET' ? true : (existing?.amount_in_edited ?? false),
    amount_in: input.amountIn.kind === 'SET' ? input.amountIn.value : (existing?.amount_in ?? null),
    amount_out_edited:
      input.amountOut.kind === 'SET' ? true : (existing?.amount_out_edited ?? false),
    amount_out: input.amountOut.kind === 'SET' ? input.amountOut.value : (existing?.amount_out ?? null),
    price_edited: input.priceFiat.kind === 'SET' ? true : (existing?.price_edited ?? false),
    price_fiat: input.priceFiat.kind === 'SET' ? input.priceFiat.value : (existing?.price_fiat ?? null),
    fiat_currency:
      input.priceFiat.kind === 'SET' ? input.priceFiat.fiatCurrency : (existing?.fiat_currency ?? null),
    total_fiat_edited:
      input.totalFiat.kind === 'SET' ? true : (existing?.total_fiat_edited ?? false),
    total_fiat: input.totalFiat.kind === 'SET' ? input.totalFiat.value : (existing?.total_fiat ?? null),
    fee_kind: input.fee.kind === 'UNCHANGED' ? (existing?.fee_kind ?? 'UNCHANGED') : input.fee.kind,
    // Only 'UNCHANGED' carries the existing amount/asset forward — an explicit 'NONE' must clear
    // them (a stated "no fee" is a fact, distinct from "not edited"), and 'CHARGED' always carries
    // its own new value, never the old one.
    fee_amount:
      input.fee.kind === 'CHARGED'
        ? input.fee.amount
        : input.fee.kind === 'UNCHANGED'
          ? (existing?.fee_amount ?? null)
          : null,
    fee_asset_id:
      input.fee.kind === 'CHARGED'
        ? input.fee.assetId
        : input.fee.kind === 'UNCHANGED'
          ? (existing?.fee_asset_id ?? null)
          : null,
    timestamp_edited: input.timestamp.kind === 'SET' ? true : (existing?.timestamp_edited ?? false),
    timestamp: input.timestamp.kind === 'SET' ? input.timestamp.value : (existing?.timestamp ?? null),
    tx_type_edited: input.txType.kind === 'SET' ? true : (existing?.tx_type_edited ?? false),
    tx_type: input.txType.kind === 'SET' ? input.txType.value : (existing?.tx_type ?? null),
    note: input.note ?? existing?.note,
  };
}
