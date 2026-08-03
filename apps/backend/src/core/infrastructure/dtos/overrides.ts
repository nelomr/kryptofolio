import { z } from 'zod';
import {
  ManualPriceOverrideSchema,
  TransferDestinationOverrideSchema,
} from '@kryptofolio/shared-types';

/**
 * Inbound DTOs for the override endpoints.
 *
 * Built on the canonical ledger schemas rather than restating them, so the currency requirement and
 * the non-negative decimal-as-string rule cannot drift between the HTTP boundary and the table. Only
 * the identity is tightened: an empty `id_hash` parses fine as a string and would key an override to
 * no transaction at all.
 */

const identity = z.string().min(1, 'id_hash is required');

export const manualPriceOverrideBatchSchema = z.object({
  overrides: z
    .array(ManualPriceOverrideSchema.extend({ id_hash: identity }))
    .min(1, 'at least one override is required'),
});

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
