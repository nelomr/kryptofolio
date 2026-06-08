import { hc } from 'hono/client';
import type { AppType } from './index';

const client = hc<AppType>('http://localhost:3001');

// Type check these
client.api.wallets.$get();
client.api.portfolio.summary.$get();
client.api.metrics.performance.$get();
