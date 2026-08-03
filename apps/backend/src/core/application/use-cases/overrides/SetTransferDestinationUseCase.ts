import { OverrideMutationUseCase, OverrideValidationError, type OverrideMutationResult } from './OverrideMutation.js';
import type { AccountId, TransactionIdHash } from '@kryptofolio/shared-types';

/** A counterparty the user declares in place of the synthetic `ownwallet-<ASSET>` account. */
export interface TransferDestinationOverrideInput {
  idHash: TransactionIdHash;
  counterpartyAccountId: AccountId;
  note?: string;
}

export class SetTransferDestinationUseCase extends OverrideMutationUseCase {
  async execute(
    overrides: readonly TransferDestinationOverrideInput[],
  ): Promise<OverrideMutationResult> {
    if (overrides.length > 0) {
      await this.validate(overrides);
    }

    return this.applyThenRebuild(overrides.length, async () => {
      for (const override of overrides) {
        await this.ledgerPort.setTransferDestinationOverride({
          id_hash: override.idHash,
          counterparty_account_id: override.counterpartyAccountId,
          note: override.note,
        });
      }
    });
  }

  private async validate(
    overrides: readonly TransferDestinationOverrideInput[],
  ): Promise<void> {
    const knownAccounts = new Set((await this.ledgerPort.getAccounts()).map((a) => a.id));
    const ownAccountByHash = new Map(
      (await this.ledgerPort.getSpotTransactions()).map((tx) => [tx.id_hash, tx.account_id]),
    );

    for (const override of overrides) {
      if (!knownAccounts.has(override.counterpartyAccountId)) {
        throw new OverrideValidationError(
          `Unknown counterparty account '${override.counterpartyAccountId}' for transaction ${override.idHash}`,
        );
      }

      // A movement whose counterparty is itself moves nothing, and the custody legs would net to
      // zero on one account — an imbalance no flag could detect.
      if (ownAccountByHash.get(override.idHash) === override.counterpartyAccountId) {
        throw new OverrideValidationError(
          `Transaction ${override.idHash} cannot be its own counterparty (${override.counterpartyAccountId})`,
        );
      }
    }
  }
}
