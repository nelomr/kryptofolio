import { OverrideMutationUseCase, type OverrideMutationResult } from './OverrideMutation.js';
import type { TransactionIdHash } from '@kryptofolio/shared-types';

/**
 * Restores a spot transaction to its imported values by soft-deleting its override.
 *
 * Single `id_hash`, not a batch (design.md D8 — bulk edit is out of scope). Removing a hash with
 * no active override is a no-op: `applied: 0`, no rebuild owed, matching the existing
 * `count === 0` path every other override mutation already uses.
 */
export class RemoveSpotTransactionOverrideUseCase extends OverrideMutationUseCase {
  async execute(idHash: TransactionIdHash): Promise<OverrideMutationResult> {
    // Checked before entering the write transaction, unlike the batch use cases this replaces:
    // a single-hash remove needs to know whether anything is *active* to decide if it owes a
    // rebuild at all, not merely how many hashes the caller asked for.
    const existing = await this.ledgerPort.getSpotTransactionOverride(idHash);
    if (!existing) {
      return { applied: 0, materialization: null };
    }

    return this.applyThenRebuild(1, async () => {
      await this.ledgerPort.removeSpotTransactionOverride(idHash);
    });
  }
}
