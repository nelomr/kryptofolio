import type { IPriceHistoryPort } from '../../../domain/ports/IPriceHistoryPort.js';

export type PriceSnapshotPortLike = Pick<IPriceHistoryPort, 'getLatest' | 'getTrackedSymbols'>;

/**
 * The same in-memory snapshot `live_prices` reads, projected as symbol -> price so `portfolio_summary`
 * values a holding with the exact string the model can also fetch from `live_prices`. The port is
 * keyed by currency, and a snapshot whose own currency is not the run's is dropped rather than
 * converted: a symbol absent from the map keeps the use case's stored valuation, so nothing is
 * fabricated. The summary derives its totals and incompleteness flags from the holdings it emits,
 * so a symbol left without a snapshot price still counts at its stored valuation.
 */
export async function resolveLivePriceSnapshot(
  port: PriceSnapshotPortLike,
  currency: string,
): Promise<Map<string, string>> {
  const symbols = await port.getTrackedSymbols();
  const snapshot = new Map<string, string>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const price = await port.getLatest(symbol, currency);
      if (price !== null && price.currency === currency) {
        snapshot.set(symbol, price.price);
      }
    }),
  );
  return snapshot;
}
