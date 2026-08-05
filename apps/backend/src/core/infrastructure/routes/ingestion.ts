import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sourceProfileIdSchema } from '@kryptofolio/shared-types';
import type { DIContainer } from '../di/container.js';
import { ingestionOutcomeSchema } from '../dtos/materialization.js';

type IngestAndMaterializeRows = Parameters<
  DIContainer['ingestAndMaterializeUseCase']['execute']
>[0]['rows'];

/**
 * Ingestion API — routes for CSV ledger ingestion.
 * POST /ingestion/transactions — process and persist ingested CSV rows.
 *
 * NOTE: Must use the chained/fluent Hono style (not imperative api.get/api.post)
 * so that TypeScript can infer the route types for AppType and the Hono RPC client.
 */

/**
 * A row as the source wrote it. No identifier: the use case derives one from the row it persists,
 * which is not the row a client could hash — grouping the legs of one operation happens behind this
 * boundary, so the client has no merged record to key.
 */
const rowSchema = z.object({
  account_id: z.string().uuid(),
  timestamp: z.string().optional(),
  tx_type: z.string().optional(),
  asset_in: z.string().optional(),
  amount_in: z.union([z.string(), z.number()]).optional().transform(v => v?.toString()),
  asset_out: z.string().optional(),
  amount_out: z.union([z.string(), z.number()]).optional().transform(v => v?.toString()),
  fee_currency: z.string().optional(),
  fee_amount: z.union([z.string(), z.number()]).optional().transform(v => v?.toString()),
  total_fiat: z.union([z.string(), z.number()]).optional().transform(v => v?.toString() ?? '0'),
  price_fiat: z.union([z.string(), z.number()]).optional().transform(v => v?.toString() ?? '0'),
  symbol: z.string().optional(),
  realized_pnl: z.union([z.string(), z.number()]).optional().transform(v => v?.toString()),
  funding_amount: z.union([z.string(), z.number()]).optional().transform(v => v?.toString()),
}).passthrough();

const transactionsBodySchema = z.object({
  rows: z.array(rowSchema),
  market: z.enum(['spot', 'futures']),
  timezone: z.string().default('UTC'),
  /**
   * Required, with no default. Which source wrote a file decides how its fee column is read, and a
   * default would let an unmeasured export be interpreted under someone else's convention while the
   * response still said success — the same silent fallback that was removed from `toSpotTxType()`.
   */
  sourceProfileId: sourceProfileIdSchema,
});

export function createIngestionApi(container: DIContainer) {
  return new Hono()
    .get('/status', (c) =>
      c.json({ status: 'idle', progress: 0, message: '', processedCount: 0, totalCount: 0 }, 200)
    )
    .post(
      '/transactions',
      zValidator('json', transactionsBodySchema),
      async (c) => {
        const { rows, market, sourceProfileId, timezone } = c.req.valid('json');

        try {
          // One call: the route states what happened, never in which order it has to happen.
          const outcome = await container.ingestAndMaterializeUseCase.execute({
            rows: rows.map(row => ({
              ...row,
              account_id: row.account_id,
            })) as IngestAndMaterializeRows,
            market,
            sourceProfileId,
            timezone,
          });

          const { ingestion } = outcome;

          // Counting the submitted rows would report a rejected one as ingested.
          const rejectedNote = ingestion.rejected.length > 0
            ? `, ${ingestion.rejected.length} rejected: ${ingestion.rejected.map(r => r.reason).join('; ')}`
            : '';
          const rebuildNote = outcome.materializationError
            ? `; recalculation pending: ${outcome.materializationError}`
            : '';

          const body = ingestionOutcomeSchema.parse({
            status: 'success',
            processedCount: ingestion.persisted,
            message: `${ingestion.persisted} transactions ingested successfully${rejectedNote}${rebuildNote}`,
            materialized: outcome.materialized,
            materialization: outcome.materialization,
            materializationError: outcome.materializationError,
            pendingReview: outcome.materialization?.pendingReview ?? 0,
            // Structured as well as narrated: the message is for a human reading a toast, this is
            // what a UI needs to list the refused rows and let the user correct them.
            rejected: ingestion.rejected,
            unresolvedFiat: ingestion.unresolvedFiat,
            pendingFeeReview: ingestion.pendingFeeReview,
          });

          return c.json(body, 201);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown ingestion error';
          return c.json({ status: 'error', message }, 500);
        }
      }
    );
}
