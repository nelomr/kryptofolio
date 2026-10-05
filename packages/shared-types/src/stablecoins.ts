/**
 * Display classification only: the concentration view reports stablecoins separately. Tax and FIFO
 * code never read this list — `fiat-currencies.ts` deliberately keeps `USDT` a taxable non-fiat asset.
 * An unlisted symbol is not a stablecoin, which errs toward counting a risky asset in concentration.
 */
export const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'EURC', 'FDUSD', 'PYUSD', 'TUSD', 'USDE'] as const;
export type StablecoinSymbol = (typeof STABLECOIN_SYMBOLS)[number];

const STABLECOIN_SET: ReadonlySet<string> = new Set(STABLECOIN_SYMBOLS);

export function isStablecoinSymbol(symbol: string): symbol is StablecoinSymbol {
  return STABLECOIN_SET.has(symbol);
}
