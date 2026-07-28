import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { DIContainer } from '../di/container.js';

function parseReportParams(
  year: string | undefined,
  method: string | undefined,
  accountId: string | undefined,
) {
  return {
    year: year ? Number(year) : new Date().getFullYear(),
    method: method || 'FIFO',
    accountId,
  };
}

export function createTaxApi(container: DIContainer) {
  return new Hono()
    .get('/transactions/spot', async (c) => {
      const accountId = c.req.query('accountId');
      const txs = await container.ledgerPort.getSpotTransactions(accountId);
      return c.json(txs, 200);
    })
    .get('/transactions/futures', async (c) => {
      const accountId = c.req.query('accountId');
      const txs = await container.ledgerPort.getFuturesTransactions(accountId);
      return c.json(txs, 200);
    })
    .get('/transactions/futures-derivatives', async (c) => {
      const accountId = c.req.query('accountId');
      const targetCurrency = c.req.query('currency');
      const pnl = await container.portfolioAnalyticsPort.getDerivativesPnl(
        accountId,
        targetCurrency,
      );
      return c.json(pnl, 200);
    })
    .get('/transactions/invalid', (c) => c.json([], 200))
    .get('/report', async (c) => {
      const params = parseReportParams(
        c.req.query('year'),
        c.req.query('method'),
        c.req.query('accountId'),
      );
      const report = await container.getSpanishTaxReportUseCase.execute(params);
      return c.json(report, 200);
    })
    .get('/report/:year', async (c) => {
      const params = parseReportParams(
        c.req.param('year'),
        c.req.query('method'),
        c.req.query('accountId'),
      );
      const report = await container.getSpanishTaxReportUseCase.execute(params);
      return c.json(report, 200);
    })
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
    .delete('/transactions/market/:market', (c) =>
      c.json({ success: true }, 200),
    )
    .post(
      '/import-wallet',
      zValidator('json', z.object({ chain: z.string(), address: z.string() })),
      (c) => c.json({ success: true }, 200),
    )
    .post('/sync-web3', zValidator('json', z.object({}).optional()), (c) =>
      c.json({ success: true }, 200),
    )
    .get('/report/download', (c) => c.body('PDF content', 200));
}
