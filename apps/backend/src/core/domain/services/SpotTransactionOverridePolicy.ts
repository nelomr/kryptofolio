/**
 * Enforces design.md D4: a `tx_type` edit must never cross the custody boundary. Transfer pairing
 * (`transfer_group_id`, the `ownwallet-<ASSET>` counterparty) is not an editable field, so an edit
 * can never turn an internal transfer into a taxable disposal, nor the reverse.
 *
 * Pure domain (rule 3): no SQL, no Zod, no I/O, and — deliberately — no identity recomputation.
 * The transaction's deterministic hash identity is owned entirely by ingestion (design.md D1);
 * this module never touches it and never needs to, because it reasons only about `tx_type` values.
 */
import { FIFO_EVENT_POLICY, type SpotTxType } from '@kryptofolio/shared-types';

/**
 * A transaction type is a "custody movement" when its FIFO policy generates neither an
 * acquisition nor a taxable disposal — DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT,
 * MIGRATION_SWAP. `FifoEventPolicy` has no field literally named `custody_movement`
 * (design.md's shorthand for this shape); this derives the same set from the existing
 * `generatesAcquisition`/`generatesDisposal`/`taxableDisposal` flags instead of hard-coding the
 * type list a second time, so the two stay impossible to drift apart.
 */
function isCustodyMovement(txType: SpotTxType): boolean {
  const policy = FIFO_EVENT_POLICY[txType];
  return !policy.generatesAcquisition && !policy.generatesDisposal && !policy.taxableDisposal;
}

const TRANSFER_TYPES = new Set<SpotTxType>(['TRANSFER_IN', 'TRANSFER_OUT']);

/**
 * Whether an edit may retype `originalTxType` to `targetTxType`, given the row's current
 * `transferGroupId` (null when the row has no transfer pairing).
 *
 * Rejects when:
 *  (a) the original type is a custody movement, or the row already has a transfer pairing —
 *      reclassifying it would silently turn (or un-turn) a custody movement into a disposal;
 *  (b) the target type is TRANSFER_IN/TRANSFER_OUT but the original type was not already a
 *      custody movement — a plain BUY/SELL/etc. cannot become a transfer leg through an edit,
 *      because that pairing is established at ingestion, not by this edit.
 */
export function canRetype(
  originalTxType: SpotTxType,
  targetTxType: SpotTxType,
  transferGroupId: string | null,
): boolean {
  if (isCustodyMovement(originalTxType) || transferGroupId !== null) {
    return false;
  }
  // Reached only when the original type is not a custody movement, so any transfer target here
  // would be a non-transfer row becoming a transfer leg — the pairing is not established by this
  // edit, so it must be rejected.
  return !TRANSFER_TYPES.has(targetTxType);
}
