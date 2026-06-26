import type { AssetPrice, MarketCategory } from "@kryptofolio/shared-types";
import type { IMarketDataProvider } from "../../domain/ports/IMarketDataProvider.js";
import { bffLogger } from "../../utils/logger.js";

/**
 * MarketDataOrchestrator — Application Service.
 *
 * Manages the lifecycle of mutually-exclusive market data providers.
 * Only ONE provider per MarketCategory can be active at a time.
 *
 * Architectural rules:
 *  - Lives in the APPLICATION layer — no framework imports.
 *  - Operates as a singleton (instantiated once in the DI container).
 *  - Calls domain ports (IMarketDataProvider) — never adapter classes directly.
 *
 * Design pattern: Functional Sandwich
 *   1. Impure: deactivate previous provider (side-effect)
 *   2. Pure: determine new active state
 *   3. Impure: connect new provider + register SSE bridge (side-effect)
 */
export class MarketDataOrchestrator {
  /** Active provider per category. Key = MarketCategory string. */
  private readonly activeProviders = new Map<
    MarketCategory,
    IMarketDataProvider
  >();

  /**
   * SSE broadcast callback — injected at construction time.
   * Called every time any active provider emits a price.
   */
  private onPriceBroadcast: (price: AssetPrice) => void;

  constructor(onPriceBroadcast: (price: AssetPrice) => void) {
    this.onPriceBroadcast = onPriceBroadcast;
  }

  public setBroadcastCallback(callback: (price: AssetPrice) => void) {
    this.onPriceBroadcast = callback;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Rate limiting state for SSE broadcast (Map of symbol -> last timestamp) */
  private readonly lastEmitTime = new Map<string, number>();
  private readonly THROTTLE_MS = 5000;

  /**
   * Activate a market data provider.
   *
   * If a provider for the same category is already active,
   * it will be gracefully disconnected BEFORE the new one is started.
   */
  async activate(provider: IMarketDataProvider): Promise<void> {
    const { category } = provider;

    // 1. Impure — disconnect previous provider for this category (if any)
    await this.deactivate(category);

    // 2. Pure — register the new provider in the map
    this.activeProviders.set(category, provider);

    // 3. Impure — bridge price events to the SSE broadcast (with 5s throttling per symbol)
    provider.onPrice((price: AssetPrice) => {
      const now = Date.now();
      const lastEmit = this.lastEmitTime.get(price.symbol) || 0;

      if (now - lastEmit >= this.THROTTLE_MS) {
        this.lastEmitTime.set(price.symbol, now);
        this.onPriceBroadcast(price);
      }
    });

    // 3b. Impure — subscribe to provider errors for centralised observability.
    // Any active adapter signals errors here; the orchestrator handles logging
    // so adapters stay decoupled from pino (or any future logger).
    provider.onError((error: Error) => {
      bffLogger.error({ providerId: provider.id, err: error }, `Market provider error: ${error.message}`);
    });

    // 4. Impure — establish the connection
    await provider.connect();
  }

  /**
   * Deactivate the provider currently active for a given category.
   * Safe to call even if no provider is active — it is a no-op in that case.
   */
  async deactivate(category: MarketCategory): Promise<void> {
    const current = this.activeProviders.get(category);
    if (!current) return;

    await current.disconnect();
    this.activeProviders.delete(category);
  }

  /**
   * Deactivate all active providers cleanly.
   * Call this on server shutdown.
   */
  async deactivateAll(): Promise<void> {
    const categories = [...this.activeProviders.keys()];
    await Promise.all(categories.map((cat) => this.deactivate(cat)));
  }

  /**
   * Returns the active provider for a given category, or null if none is active.
   */
  getActiveProvider(category: MarketCategory): IMarketDataProvider | null {
    return this.activeProviders.get(category) ?? null;
  }

  /**
   * Returns a snapshot of all currently active providers.
   */
  getActiveProviders(): ReadonlyMap<MarketCategory, IMarketDataProvider> {
    return this.activeProviders;
  }
}
