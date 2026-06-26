import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  MOCK_TRANSACTIONS,
  MOCK_TAX_REPORT,
  MOCK_FUTURES_TRANSACTIONS,
  MOCK_FUTURES_DERIVATIVES,
} from '../../../data/mockTax.js';

const taxApi = new Hono()
  .get('/transactions/spot', (c) => c.json(MOCK_TRANSACTIONS, 200))
  .get('/transactions/futures', (c) => c.json(MOCK_FUTURES_TRANSACTIONS, 200))
  .get('/transactions/futures-derivatives', (c) => c.json(MOCK_FUTURES_DERIVATIVES, 200))
  .get('/transactions/invalid', (c) => c.json([], 200))
  .get('/report', (c) => c.json(MOCK_TAX_REPORT, 200))
  .delete('/transactions/:id', (c) => c.json({ success: true }, 200))
  .put('/transactions/:id', zValidator('json', z.record(z.unknown())), (c) =>
    c.json({ success: true }, 200),
  )
  .post(
    '/transactions/validate',
    zValidator('json', z.record(z.unknown())),
    (c) => c.json({ success: true }, 200),
  )
  .post('/upload', (c) => c.json({ success: true }, 200))
  .delete('/transactions/market/:market', (c) => c.json({ success: true }, 200))
  .post(
    '/import-wallet',
    zValidator('json', z.object({ chain: z.string(), address: z.string() })),
    (c) => c.json({ success: true }, 200),
  )
  .post('/sync-web3', zValidator('json', z.object({}).optional()), (c) =>
    c.json({ success: true }, 200),
  )
  .get('/report/download', (c) => c.body('PDF content', 200));

export default taxApi;
