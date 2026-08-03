import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { DIContainer } from '../di/container.js';
import { rebuildOutcomeSchema } from '../dtos/materialization.js';

export function createPortfolioApi(container: DIContainer) {
  return new Hono()
    .get('/summary', async (c) => {
      const accountId = c.req.query('accountId');
      const targetCurrency = c.req.query('currency');

      const summary = await container.getPortfolioSummaryUseCase.execute({
        accountId,
        targetCurrency,
      });

      return c.json(summary, 200);
    })
    .get('/holdings', async (c) => {
      const accountId = c.req.query('accountId');
      const targetCurrency = c.req.query('currency');

      const summary = await container.getPortfolioSummaryUseCase.execute({
        accountId,
        targetCurrency,
      });

      return c.json(summary.holdings, 200);
    })
    .get('/derivatives/pnl', async (c) => {
      const accountId = c.req.query('accountId');
      const targetCurrency = c.req.query('currency');

      const pnl = await container.portfolioAnalyticsPort.getDerivativesPnl(
        accountId,
        targetCurrency,
      );

      return c.json(pnl, 200);
    })
    .get('/token/:symbol', (c) => c.json({}, 200))
    .get('/token/:symbol/history', async (c) => {
      const symbol = c.req.param('symbol');
      const accountId = c.req.query('accountId');
      const history = await container.getTokenHistoryUseCase.execute({
        symbol,
        accountId,
      });
      return c.json(history, 200);
    })
    .post(
      '/rebuild',
      zValidator('json', z.object({}).optional()),
      async (c) => {
        try {
          // Forced: this endpoint is the retry, so it must not consult the pending marker it clears.
          const materialization = await container.fifoMaterializerService.recalculate(true);

          const body = rebuildOutcomeSchema.parse({
            materialized: true,
            materialization,
            materializationError: null,
            pendingReview: materialization.pendingReview,
          });

          return c.json(body, 200);
        } catch (error) {
          console.error('[PortfolioApi] Failed to rebuild metrics:', error);
          return c.json({ success: false, error: 'Internal Server Error' }, 500);
        }
      },
    );
}
