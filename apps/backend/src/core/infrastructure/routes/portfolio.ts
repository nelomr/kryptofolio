import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import mockPortfolio from '../../../data/mockPortfolio.js';

const portfolioApi = new Hono()
  .get('/summary', (c) => c.json(mockPortfolio.summary, 200))
  .get('/token/:symbol', (c) => c.json({}, 200))
  .get('/token/:symbol/history', (c) => {
    const symbol = c.req.param('symbol').toUpperCase();
    const lots = (mockPortfolio.lots as Record<string, unknown[]>)[symbol] || [];
    const history = (mockPortfolio.history as Record<string, unknown>)[symbol] || {};
    return c.json({ lots, history }, 200);
  })
  .post(
    '/rebuild',
    zValidator('json', z.object({}).optional()),
    (c) => c.json({ success: true }, 200),
  );

export default portfolioApi;
