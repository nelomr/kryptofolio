import { Hono } from 'hono';
import type { DIContainer } from '../di/container.js';

export function createMetricsApi(container: DIContainer) {
  return new Hono()
    .get('/kpis', async (c) => {
      const targetCurrency = c.req.query('currency');
      const kpis = await container.getKpisUseCase.execute(targetCurrency);
      return c.json(kpis, 200);
    })
    .get('/allocation', async (c) => {
      const targetCurrency = c.req.query('currency');
      const allocation = await container.getAssetAllocationUseCase.execute(targetCurrency);
      return c.json(allocation, 200);
    })
    .get('/performance', async (c) => {
      const days = Number(c.req.query('days') || '30');
      const targetCurrency = c.req.query('currency');
      const history = await container.getPerformanceHistoryUseCase.execute(days, targetCurrency);
      return c.json(history, 200);
    })
    .get('/heatmap', async (c) => {
      const yearStr = c.req.query('year');
      const year = yearStr ? Number(yearStr) : undefined;
      const targetCurrency = c.req.query('currency');
      const heatmap = await container.getVolatilityHeatmapUseCase.execute(year, targetCurrency);
      return c.json(heatmap, 200);
    })
    .get('/drawdown', async (c) => {
      const days = Number(c.req.query('days') || '30');
      const targetCurrency = c.req.query('currency');
      const drawdown = await container.getDrawdownCurveUseCase.execute(days, targetCurrency);
      return c.json(drawdown, 200);
    })
    .get('/risk', async (c) => {
      const targetCurrency = c.req.query('currency');
      const risk = await container.getRiskMetricsUseCase.execute(targetCurrency);
      return c.json(risk, 200);
    })
    .get('/token/:symbol', (c) => c.json({}, 200));
}
