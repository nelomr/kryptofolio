import { z } from 'zod';
import { TransferDestinationOverrideSchema, spotTransactionEditSchema } from '@kryptofolio/shared-types';

// Re-exported rather than imported directly by the route: every other DTO in this file is
// re-exported from here too, so the route module has one place to import inbound shapes from.
export { spotTransactionEditSchema };

/**
 * Inbound DTOs for the override endpoints.
 *
 * Built on the canonical ledger schemas rather than restating them, so the currency requirement and
 * the non-negative decimal-as-string rule cannot drift between the HTTP boundary and the table. Only
 * the identity is tightened: an empty `id_hash` parses fine as a string and would key an override to
 * no transaction at all.
 *
 * `manualPriceOverrideBatchSchema` was removed here (design.md D3, task 1.5's real deletion):
 * manual_price_overrides was unified into spot_transaction_overrides. The replacement DTO is
 * `spotTransactionEditSchema` in `@kryptofolio/shared-types` (group 1 of this change).
 */

const identity = z.string().min(1, 'id_hash is required');

export const transferDestinationBatchSchema = z.object({
  overrides: z
    .array(
      TransferDestinationOverrideSchema.extend({
        id_hash: identity,
        counterparty_account_id: z.string().min(1),
      }),
    )
    .min(1, 'at least one override is required'),
});

export const overrideRemovalSchema = z.object({
  idHashes: z.array(identity).min(1, 'at least one id_hash is required'),
});
