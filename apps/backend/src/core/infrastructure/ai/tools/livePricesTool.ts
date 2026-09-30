import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { preciseAmountSchema, SYMBOL_REGEX } from '@kryptofolio/shared-types';
import type { AssetPrice } from '@kryptofolio/shared-types';
import type { IPriceHistoryPort } from '../../../domain/ports/IPriceHistoryPort.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

const resolvedPriceSchema = z
  .object({
    symbol: z.string(),
    price: preciseAmountSchema,
    currency: z.string(),
    timestamp: z.string(),
    provider: z.string(),
    stalenessSeconds: z.number().int().nonnegative(),
  })
  .strict();

const livePricesPayloadSchema = z
  .object({
    prices: z.array(resolvedPriceSchema),
    notTracked: z.array(z.string()),
  })
  .strict();

export const livePricesToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: livePricesPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type LivePricesToolPayload = z.infer<typeof livePricesPayloadSchema>;

export const livePricesToolInputSchema = z
  .object({
    symbols: z.array(z.string().regex(SYMBOL_REGEX)).min(1).max(25),
  })
  .strict();

function stalenessSecondsOf(timestamp: string, now: () => Date): number {
  const capturedAt = new Date(timestamp).getTime();
  const elapsedMs = Math.max(0, now().getTime() - capturedAt);
  return Math.floor(elapsedMs / 1000);
}

function toResolvedPrice(price: AssetPrice, now: () => Date): LivePricesToolPayload['prices'][number] {
  return {
    symbol: price.symbol,
    price: price.price,
    currency: price.currency,
    timestamp: price.timestamp,
    provider: price.provider,
    stalenessSeconds: stalenessSecondsOf(price.timestamp, now),
  };
}

export interface LivePricesToolConfig {
  maxChars: number;
  /**
   * Resolved server-side, same as `targetCurrency` in `portfolio_summary` — the model never supplies
   * a currency for this tool.
   */
  currency: string;
  /** Injectable for deterministic staleness computation in tests; defaults to `() => new Date()`. */
  now?: () => Date;
  /** The run-wide cap tracker — one instance per advisor run, `undefined` for a metered run. */
  runBudgetTracker?: RunBudgetTracker;
}

/**
 * Pure projection + budget gate over already-resolved `AssetPrice | null` results. An untracked
 * symbol is never fabricated a price — it is listed in `notTracked` instead.
 */
export function buildLivePricesToolResult(
  resolved: readonly { symbol: string; price: AssetPrice | null }[],
  config: LivePricesToolConfig,
): EnforceBudgetResult<LivePricesToolPayload> {
  const now = config.now ?? (() => new Date());
  const prices: LivePricesToolPayload['prices'] = [];
  const notTracked: string[] = [];

  for (const entry of resolved) {
    if (entry.price === null) {
      notTracked.push(entry.symbol);
    } else {
      prices.push(toResolvedPrice(entry.price, now));
    }
  }

  const payload: LivePricesToolPayload = { prices, notTracked };

  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

/** Structural, not the concrete class: the tool only ever calls `getLatest`. */
export type PriceHistoryPortLike = Pick<IPriceHistoryPort, 'getLatest'>;

/**
 * Constructor takes only the wrapped port method plus pure configuration. Calls only
 * `getLatest` per symbol, on the already-running port — opens no new provider connection and starts
 * no market-data stream.
 */
export function livePricesTool(port: PriceHistoryPortLike, config: LivePricesToolConfig) {
  return createTool({
    id: 'live_prices',
    description:
      'The latest cached price for each requested symbol, or a note that it is not tracked. Read-only; opens no new connection.',
    inputSchema: livePricesToolInputSchema,
    outputSchema: livePricesToolOutputSchema,
    execute: async (inputData) => {
      const resolved = await Promise.all(
        inputData.symbols.map(async (symbol) => ({
          symbol,
          price: await port.getLatest(symbol, config.currency),
        })),
      );
      return buildLivePricesToolResult(resolved, config);
    },
  });
}
