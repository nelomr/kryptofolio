import type Decimal from 'decimal.js';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';
import type { KrakenMarketDataAdapter } from './KrakenMarketDataAdapter.js';
import { toPreciseAmount, type PreciseAmount } from '../../domain/value-objects/PreciseAmount.js';

/**
 * Adapter that implements IPriceProviderPort by delegating to KrakenMarketDataAdapter.
 * This adapter maps the domain port requirements to the specific infrastructure client.
 */
export class KrakenPriceProviderAdapter implements IPriceProviderPort {
  private readonly krakenMarketDataAdapter: KrakenMarketDataAdapter;

  constructor(krakenMarketDataAdapter: KrakenMarketDataAdapter) {
    this.krakenMarketDataAdapter = krakenMarketDataAdapter;
  }

  public async getHistoricalPrice(asset: string, fiatCurrency: string, timestamp: string): Promise<PreciseAmount> {
    const adapter = this.krakenMarketDataAdapter as unknown as { getHistoricalPrice?: (a: string, f: string, t: string) => Promise<Decimal> };
    
    if (typeof adapter.getHistoricalPrice === 'function') {
      const price = await adapter.getHistoricalPrice(asset, fiatCurrency, timestamp);
      return toPreciseAmount(price.toString());
    }
    
    // Fallback: return '0' — caller will handle missing price gracefully
    return toPreciseAmount('0');
  }
}
