import { AssetPriceSchema } from './packages/shared-types/dist/market-data/schemas.js';

const price = {
  symbol: 'BTC',
  currency: 'USD',
  price: 63110.00,
  change24hPercent: -1.838,
  provider: 'binance',
  timestamp: new Date().toISOString(),
};

const result = AssetPriceSchema.safeParse(price);
console.log(result.success ? "SUCCESS" : result.error);
