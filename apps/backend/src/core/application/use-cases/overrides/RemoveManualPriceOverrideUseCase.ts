import { OverrideMutationUseCase, type OverrideMutationResult } from './OverrideMutation.js';
import type { TransactionIdHash } from '@kryptofolio/shared-types';

export class RemoveManualPriceOverrideUseCase extends OverrideMutationUseCase {
  async execute(idHashes: readonly TransactionIdHash[]): Promise<OverrideMutationResult> {
    return this.applyThenRebuild(idHashes.length, async () => {
      for (const idHash of idHashes) {
        await this.ledgerPort.removeManualPriceOverride(idHash);
      }
    });
  }
}
