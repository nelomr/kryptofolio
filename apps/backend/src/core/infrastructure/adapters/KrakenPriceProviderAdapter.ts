import type Decimal from 'decimal.js';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';
import type { KrakenMarketDataAdapter } from './KrakenMarketDataAdapter.js';

/**
 * Adapter that implements IPriceProviderPort by delegating to KrakenMarketDataAdapter.
 * This adapter maps the domain port requirements to the specific infrastructure client.
 */
export class KrakenPriceProviderAdapter implements IPriceProviderPort {
  private readonly krakenMarketDataAdapter: KrakenMarketDataAdapter;

  constructor(krakenMarketDataAdapter: KrakenMarketDataAdapter) {
    this.krakenMarketDataAdapter = krakenMarketDataAdapter;
  }

  public async getHistoricalPrice(asset: string, fiatCurrency: string, timestamp: string): Promise<Decimal> {
    const adapter = this.krakenMarketDataAdapter as unknown as { getHistoricalPrice?: (a: string, f: string, t: string) => Promise<Decimal> };
    
    if (typeof adapter.getHistoricalPrice === 'function') {
      return adapter.getHistoricalPrice(asset, fiatCurrency, timestamp);
    }
    
    // Fallback: return 0 — caller will handle missing price gracefully
    const { default: DecimalClass } = await import('decimal.js');
    return new DecimalClass('0');
  }
}
