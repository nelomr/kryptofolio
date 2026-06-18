import type { AssetPrice, GlobalMarketMetrics } from '@kryptofolio/shared-types';
import type { IMarketDataPort } from '@/core/domain/ports/IMarketDataPort';

/**
 * GetMarketDataUseCase — Application Use Case.
 *
 * Provides the UI with a clean, type-safe API to:
 *  1. Subscribe to the real-time market data SSE stream.
 *  2. Fetch a one-shot snapshot of global market metrics.
 *
 * Architectural rules:
 *  - No Vue, Axios, or framework imports — pure TypeScript.
 *  - Inputs are primitives / callbacks — LLM-tool-ready.
 *  - Delegates all I/O to the IMarketDataPort (port, not adapter).
 */
export class GetMarketDataUseCase {
  private readonly marketDataPort: IMarketDataPort;

  constructor(marketDataPort: IMarketDataPort) {
    this.marketDataPort = marketDataPort;
  }

  /**
   * Subscribe to the backend SSE stream for real-time price updates.
   *
   * @param onPrice — Callback invoked on each incoming AssetPrice event.
   * @param onError — Optional callback for SSE connection errors.
   * @returns       — Cleanup function to close the SSE connection.
   */
  subscribeToStream(
    onPrice: (price: AssetPrice) => void,
    onError?: (error: Event) => void,
  ): () => void {
    return this.marketDataPort.subscribeToStream(onPrice, onError);
  }

  /**
   * Fetch a one-shot snapshot of global market metrics.
   */
  async getGlobalMetrics(): Promise<GlobalMarketMetrics> {
    return this.marketDataPort.getGlobalMetrics();
  }
}
