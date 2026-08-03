import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAccountId, createTransactionIdHash } from '@kryptofolio/shared-types';
import type { DIContainer } from '../di/container.js';
import { OverrideValidationError } from '../../application/use-cases/overrides/OverrideMutation.js';
import type { OverrideMutationResult } from '../../application/use-cases/overrides/OverrideMutation.js';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';
import {
  manualPriceOverrideBatchSchema,
  overrideRemovalSchema,
  transferDestinationBatchSchema,
} from '../dtos/overrides.js';
import { overrideOutcomeSchema } from '../dtos/materialization.js';

/**
 * Fiscal API — the user's calculation inputs.
 *
 * Every endpoint takes a batch and costs exactly one rebuild, which is the use case's guarantee and
 * not the route's: the route converts a validated payload into branded domain values and nothing else.
 *
 * NOTE: Must use the chained/fluent Hono style so TypeScript can infer the route types for AppType.
 */

function outcomeBody(result: OverrideMutationResult) {
  return overrideOutcomeSchema.parse({
    applied: result.applied,
    materialization: result.materialization,
    pendingReview: result.materialization?.pendingReview ?? 0,
  });
}

/** A rejected declaration is the user's to correct, so it is not reported as a server failure. */
function errorBody(error: unknown): {
  body: { status: 'error'; message: string };
  status: 422 | 500;
} {
  if (error instanceof OverrideValidationError) {
    return { body: { status: 'error', message: error.message }, status: 422 };
  }
  return {
    body: {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown override error',
    },
    status: 500,
  };
}

export function createFiscalApi(container: DIContainer) {
  return new Hono()
    .put('/overrides/prices', zValidator('json', manualPriceOverrideBatchSchema), async (c) => {
      const { overrides } = c.req.valid('json');
      try {
        const result = await container.setManualPriceOverrideUseCase.execute(
          overrides.map((override) => ({
            idHash: createTransactionIdHash(override.id_hash),
            priceFiat: toPreciseAmount(override.price_fiat),
            fiatCurrency: override.fiat_currency,
            note: override.note,
          })),
        );
        return c.json(outcomeBody(result), 200);
      } catch (error) {
        const { body, status } = errorBody(error);
        return c.json(body, status);
      }
    })
    .delete('/overrides/prices', zValidator('json', overrideRemovalSchema), async (c) => {
      const { idHashes } = c.req.valid('json');
      try {
        const result = await container.removeManualPriceOverrideUseCase.execute(
          idHashes.map(createTransactionIdHash),
        );
        return c.json(outcomeBody(result), 200);
      } catch (error) {
        const { body, status } = errorBody(error);
        return c.json(body, status);
      }
    })
    .put(
      '/overrides/destinations',
      zValidator('json', transferDestinationBatchSchema),
      async (c) => {
        const { overrides } = c.req.valid('json');
        try {
          const result = await container.setTransferDestinationUseCase.execute(
            overrides.map((override) => ({
              idHash: createTransactionIdHash(override.id_hash),
              counterpartyAccountId: createAccountId(override.counterparty_account_id),
              note: override.note,
            })),
          );
          return c.json(outcomeBody(result), 200);
        } catch (error) {
          const { body, status } = errorBody(error);
          return c.json(body, status);
        }
      },
    )
    .delete('/overrides/destinations', zValidator('json', overrideRemovalSchema), async (c) => {
      const { idHashes } = c.req.valid('json');
      try {
        const result = await container.removeTransferDestinationUseCase.execute(
          idHashes.map(createTransactionIdHash),
        );
        return c.json(outcomeBody(result), 200);
      } catch (error) {
        const { body, status } = errorBody(error);
        return c.json(body, status);
      }
    });
}
