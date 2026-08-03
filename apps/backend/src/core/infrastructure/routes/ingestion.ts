import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { DIContainer } from '../di/container.js';

/**
 * Ingestion API — routes for CSV ledger ingestion.
 * POST /ingestion/transactions — process and persist ingested CSV rows.
 *
 * NOTE: Must use the chained/fluent Hono style (not imperative api.get/api.post)
 * so that TypeScript can infer the route types for AppType and the Hono RPC client.
 */

const rowSchema = z.object({
  id_hash: z.string().min(1, 'id_hash is required — generate with core-domain generateIdHash'),
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
        const { rows, market } = c.req.valid('json');

        try {
          const result = await container.csvIngestionUseCase.execute(
            rows.map(row => ({
              ...row,
              account_id: row.account_id,
              id_hash: row.id_hash,
            })) as Parameters<typeof container.csvIngestionUseCase.execute>[0],
            market
          );

          // Counting the submitted rows would report a rejected one as ingested.
          const rejectedNote = result.rejected.length > 0
            ? `, ${result.rejected.length} rejected: ${result.rejected.map(r => r.reason).join('; ')}`
            : '';

          return c.json({
            status: 'success',
            processedCount: result.persisted,
            message: `${result.persisted} transactions ingested successfully${rejectedNote}`,
          }, 201);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown ingestion error';
          return c.json({ status: 'error', message }, 500);
        }
      }
    );
}
