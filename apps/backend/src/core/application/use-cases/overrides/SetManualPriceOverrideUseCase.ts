import { OverrideMutationUseCase, OverrideValidationError, type OverrideMutationResult } from './OverrideMutation.js';
import type { PreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import type { TransactionIdHash } from '@kryptofolio/shared-types';

/**
 * A fiat value the user declares for a transaction the market could not price.
 *
 * Keyed on the transaction's deterministic identity rather than its surrogate id, so re-ingesting the
 * same source file does not orphan the declaration.
 */
export interface ManualPriceOverrideInput {
  idHash: TransactionIdHash;
  /** Precision value object: a declared figure must survive as the user typed it. */
  priceFiat: PreciseAmount;
  fiatCurrency: string;
  note?: string;
}

export class SetManualPriceOverrideUseCase extends OverrideMutationUseCase {
  async execute(overrides: readonly ManualPriceOverrideInput[]): Promise<OverrideMutationResult> {
    for (const override of overrides) {
      // A value without its currency is not interpretable, and nothing downstream could recover the
      // missing half.
      if (override.fiatCurrency.trim().length === 0) {
        throw new OverrideValidationError(
          `Manual price override for ${override.idHash} carries no currency`,
        );
      }
    }

    return this.applyThenRebuild(overrides.length, async () => {
      for (const override of overrides) {
        await this.ledgerPort.setManualPriceOverride({
          id_hash: override.idHash,
          price_fiat: override.priceFiat,
          fiat_currency: override.fiatCurrency,
          note: override.note,
        });
      }
    });
  }
}
