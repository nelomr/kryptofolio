import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAccountId, createTransactionIdHash } from '@kryptofolio/shared-types';
import type { DIContainer } from '../di/container.js';
import {
  OverrideValidationError,
  OverrideNotFoundError,
} from '../../application/use-cases/overrides/OverrideMutation.js';
import type { OverrideMutationResult } from '../../application/use-cases/overrides/OverrideMutation.js';
import type {
  SpotOverrideMutationResult,
  SpotTransactionOverrideEditInput,
} from '../../application/use-cases/overrides/SetSpotTransactionOverrideUseCase.js';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';
import {
  overrideRemovalSchema,
  transferDestinationBatchSchema,
  spotTransactionEditSchema,
} from '../dtos/overrides.js';
import { overrideOutcomeSchema, spotOverrideOutcomeSchema } from '../dtos/materialization.js';
import { fiscalIntegrityReportSchema } from '../dtos/fiscal-integrity.js';
import type { SpotTransactionEditInput } from '@kryptofolio/shared-types';

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

function spotOutcomeBody(result: SpotOverrideMutationResult) {
  return spotOverrideOutcomeSchema.parse({
    applied: result.applied,
    materialization: result.materialization,
    pendingReview: result.materialization?.pendingReview ?? 0,
    balanceCheck: result.balanceCheck,
  });
}

/** A rejected declaration is the user's to correct, so it is not reported as a server failure. */
function errorBody(error: unknown): {
  body: { status: 'error'; message: string };
  status: 404 | 422 | 500;
} {
  if (error instanceof OverrideNotFoundError) {
    return { body: { status: 'error', message: error.message }, status: 404 };
  }
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

/**
 * Maps the shared `spotTransactionEditSchema` shape (snake_case, plain decimal strings) to the
 * use case's `SpotTransactionOverrideEditInput` (camelCase, branded `PreciseAmount`) — the same
 * anti-corruption role every other route in this file already plays.
 */
function toEditInput(
  idHash: string,
  body: SpotTransactionEditInput,
): SpotTransactionOverrideEditInput {
  return {
    idHash: createTransactionIdHash(idHash),
    amountIn:
      body.amount_in.kind === 'SET'
        ? { kind: 'SET', value: toPreciseAmount(body.amount_in.value) }
        : { kind: 'UNCHANGED' },
    amountOut:
      body.amount_out.kind === 'SET'
        ? { kind: 'SET', value: toPreciseAmount(body.amount_out.value) }
        : { kind: 'UNCHANGED' },
    priceFiat:
      body.price_fiat.kind === 'SET'
        ? {
            kind: 'SET',
            value: toPreciseAmount(body.price_fiat.value),
            fiatCurrency: body.price_fiat.fiatCurrency,
          }
        : { kind: 'UNCHANGED' },
    totalFiat:
      body.total_fiat.kind === 'SET'
        ? { kind: 'SET', value: body.total_fiat.value === null ? null : toPreciseAmount(body.total_fiat.value) }
        : { kind: 'UNCHANGED' },
    fee:
      body.fee.kind === 'CHARGED'
        ? { kind: 'CHARGED', amount: toPreciseAmount(body.fee.amount), assetId: body.fee.assetId }
        : body.fee.kind === 'NONE'
          ? { kind: 'NONE' }
          : { kind: 'UNCHANGED' },
    timestamp:
      body.timestamp.kind === 'SET'
        ? { kind: 'SET', value: body.timestamp.value }
        : { kind: 'UNCHANGED' },
    txType:
      body.tx_type.kind === 'SET'
        ? { kind: 'SET', value: body.tx_type.value }
        : { kind: 'UNCHANGED' },
  };
}

export function createFiscalApi(container: DIContainer) {
  return new Hono()
    .get('/integrity', async (c) => {
      const accountId = c.req.query('accountId');
      const report = await container.getFiscalIntegrityUseCase.execute({ accountId });
      return c.json(fiscalIntegrityReportSchema.parse(report), 200);
    })
    // PUT/DELETE /overrides/prices were removed here (design.md D3): manual_price_overrides was
    // unified into spot_transaction_overrides and dropped (migration 008). The replacement is
    // PUT/DELETE /overrides/transactions/:idHash, below — a single hash, not a batch (bulk edit
    // is out of scope per design.md D8).
    .put('/overrides/transactions/:idHash', zValidator('json', spotTransactionEditSchema), async (c) => {
      const idHash = c.req.param('idHash');
      const body = c.req.valid('json');
      try {
        const result = await container.setSpotTransactionOverrideUseCase.execute(
          toEditInput(idHash, body),
        );
        return c.json(spotOutcomeBody(result), 200);
      } catch (error) {
        const { body: errBody, status } = errorBody(error);
        return c.json(errBody, status);
      }
    })
    .delete('/overrides/transactions/:idHash', async (c) => {
      const idHash = c.req.param('idHash');
      try {
        const result = await container.removeSpotTransactionOverrideUseCase.execute(
          createTransactionIdHash(idHash),
        );
        return c.json(
          spotOutcomeBody({ ...result, balanceCheck: { kind: 'CLEAN' } }),
          200,
        );
      } catch (error) {
        const { body: errBody, status } = errorBody(error);
        return c.json(errBody, status);
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
