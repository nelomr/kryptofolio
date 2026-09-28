import type { AssetPrice, GlobalMarketMetrics } from '@kryptofolio/shared-types';
import { AssetPriceSchema, GlobalMarketMetricsSchema } from '@kryptofolio/shared-types';
import type { IMarketDataPort } from '@/core/domain/ports/IMarketDataPort';
import { errorBus } from '@/core/infrastructure/errors/errorBus';

/**
 * BffMarketDataAdapter — Infrastructure Adapter.
 *
 * Implements IMarketDataPort by connecting to the Kryptofolio backend:
 *  - SSE stream  → GET /api/market/stream
 *  - REST        → GET /api/market/global
 *
 * Anti-Corruption Layer:
 *  - SSE price events are validated through AssetPriceSchema (from shared-types).
 *  - REST responses are validated through GlobalMarketMetricsSchema.
 *  - On validation failure, an error is emitted to errorBus (not thrown silently).
 */
export class BffMarketDataAdapter implements IMarketDataPort {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
  }

  // ---------------------------------------------------------------------------
  // IMarketDataPort
  // ---------------------------------------------------------------------------

  /**
   * Opens an EventSource connection to the backend SSE stream.
   * Returns a cleanup function that closes the connection.
   *
   * The browser's EventSource API provides:
   *  - Automatic reconnection on network failure.
   *  - Native HTTP/2 multiplexing support.
   */
  subscribeToStream(
    onPrice: (price: AssetPrice) => void,
    onError?: (error: Event) => void,
  ): () => void {
    const source = new EventSource(`${this.baseUrl}/api/market/stream`);

    source.addEventListener('price', (event: MessageEvent) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data as string);
      } catch {
        errorBus.emit('validation-error', {
          message: 'errors.market.invalid_sse_json',
          context: 'BffMarketDataAdapter.subscribeToStream',
          details: event.data,
        });
        return;
      }

      const payload = raw as { type: string; data: unknown };
      const result = AssetPriceSchema.safeParse(payload.data);
      if (!result.success) {
        errorBus.emit('validation-error', {
          message: 'errors.market.invalid_price_event',
          context: 'BffMarketDataAdapter.subscribeToStream',
          details: result.error,
        });
        return;
      }

      onPrice(result.data);
    });

    // Real UX gap found by the user: a dead backend produced only `net::ERR_CONNECTION_REFUSED`
    // console spam — `EventSource` auto-reconnects silently, with no visible "stream down" state,
    // which read as "the whole app broke" even though it recovers on its own. This fires
    // regardless of whether a caller passed its own `onError`, so App.vue's existing errorBus/toast
    // wiring surfaces it without every future `subscribeToStream` caller having to remember to.
    let wasDown = false;
    source.addEventListener('error', () => {
      if (!wasDown) {
        wasDown = true;
        errorBus.emit('operation-error', {
          code: 'MARKET_STREAM_DOWN',
          message: 'errors.market.stream_down',
        });
      }
    });
    source.addEventListener('open', () => {
      if (wasDown) {
        wasDown = false;
        errorBus.emit('operation-error', {
          code: 'MARKET_STREAM_RECOVERED',
          message: 'errors.market.stream_recovered',
        });
      }
    });

    if (onError) {
      source.addEventListener('error', onError);
    }

    // Return cleanup function — called by Vue's onUnmounted / onScopeDispose
    return () => {
      source.close();
    };
  }

  /**
   * Fetches global market metrics from the REST endpoint.
   */
  async getGlobalMetrics(): Promise<GlobalMarketMetrics> {
    const response = await fetch(`${this.baseUrl}/api/market/global`);
    if (!response.ok) {
      throw new Error(`[BffMarketDataAdapter] /api/market/global returned ${response.status}`);
    }

    const raw = await response.json();
    const result = GlobalMarketMetricsSchema.safeParse(raw);

    if (!result.success) {
      errorBus.emit('validation-error', {
        message: 'errors.market.invalid_global_metrics',
        context: 'BffMarketDataAdapter.getGlobalMetrics',
        details: result.error,
      });
      throw new Error('[BffMarketDataAdapter] GlobalMarketMetrics validation failed');
    }

    return result.data;
  }
}
