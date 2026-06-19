import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type {
  AssetPrice,
  GlobalMarketMetrics,
  SseMarketEvent,
} from '@kryptofolio/shared-types';
import { bffLogger } from '../../utils/logger.js';
import { container } from '../di/container.js';
import { StreamNormalizedMarketDataUC } from '../../application/use-cases/StreamNormalizedMarketDataUC.js';

type Env = { Bindings: { MODE?: string; SECRET_API_KEY?: string } };

/** Set of active SSE connections — broadcast market events to all clients */
const sseClients = new Set<(event: SseMarketEvent) => void>();

/**
 * broadcastPrice — Called by MarketDataOrchestrator every time a provider emits a price.
 * Pushes the event to all connected SSE clients.
 */
export function broadcastPrice(price: AssetPrice): void {
  const event: SseMarketEvent = { type: 'price', data: price };

 //Save price to history so REST API (/global) and new SSE connections get the latest data
  container.priceHistoryPort.save(price).catch((err) => {
    bffLogger.error({ err }, 'Failed to save price to history port');
  });

  for (const send of sseClients) {
    try {
      send(event);
    } catch {
      // Client disconnected — will be cleaned up on the abort signal
    }
  }
}

/**
 * broadcastGlobal — Called when CoinGecko global metrics are refreshed.
 */
export function broadcastGlobal(metrics: GlobalMarketMetrics): void {
  const event: SseMarketEvent = { type: 'global', data: metrics };
  for (const send of sseClients) {
    try {
      send(event);
    } catch {
      // Client disconnected
    }
  }
}

const marketApi = new Hono<Env>()
  /**
   * GET /api/market/stream — Server-Sent Events endpoint.
   *
   * Frontend connects once and receives real-time AssetPrice and
   * GlobalMarketMetrics updates from all active providers.
   *
   * SSE advantages over WS for this use-case:
   *  - Unidirectional (server → client) — simpler for read-only feeds.
   *  - Auto-reconnect built into the browser EventSource API.
   *  - Works through HTTP/2 multiplexing.
   */
  .get('/stream', async (c) => {
    return streamSSE(c, async (stream) => {
      bffLogger.info('SSE client connected');

      const useCase = new StreamNormalizedMarketDataUC(container.userSettingsPort);

      const send = async (event: SseMarketEvent) => {
        try {
          if (event.type === 'price') {
            const normalizedPrice = await useCase.execute(event.data as AssetPrice);
            void stream.writeSSE({
              data: JSON.stringify({ type: 'price', data: normalizedPrice }),
              event: event.type,
            });
          } else {
            void stream.writeSSE({
              data: JSON.stringify(event),
              event: event.type,
            });
          }
        } catch (err) {
          bffLogger.error({ err }, 'Failed to write SSE event');
        }
      };

      sseClients.add(send);

      // Send the current latest prices immediately on connection
      const latestPrices = await container.priceHistoryPort.getTrackedSymbols();
      for (const symbolPair of latestPrices) {
        const [symbol, currency] = symbolPair.split(':');
        if (!symbol || !currency) continue;
        const latest = await container.priceHistoryPort.getLatest(
          symbol,
          currency,
        );
        if (latest) broadcastPrice(latest);
      }

      // Keep the SSE connection alive until the client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          sseClients.delete(send);
          bffLogger.info('SSE client disconnected');
          resolve();
        });
      });
    });
  })

  /**
   * GET /api/market/global — One-shot REST endpoint for global market metrics.
   *
   * Used by components that do not need real-time updates (e.g., summary widgets).
   */
  .get('/global', async (c) => {
    const symbols = await container.priceHistoryPort.getTrackedSymbols();

    // Gather latest price for each tracked asset
    const topAssets: AssetPrice[] = (
      await Promise.all(
        symbols.map(async (pair) => {
          const [symbol, currency] = pair.split(':');
          if (!symbol || !currency) return null;
          return container.priceHistoryPort.getLatest(symbol, currency);
        }),
      )
    ).filter((p): p is AssetPrice => p !== null);

    return c.json({
      totalMarketCapUsd: 0, // Populated by CoinGecko adapter on next poll
      marketCapChange24hPercent: 0,
      fearGreedIndex: null,
      fearGreedLabel: null,
      topAssets,
      timestamp: new Date().toISOString(),
    });
  });

export default marketApi;
