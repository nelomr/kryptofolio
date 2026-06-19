import { Hono } from 'hono';
import {
  MOCK_KPIS,
  generatePerformanceHistory,
  generateDrawdownCurve,
  MOCK_ASSET_ALLOCATION,
  generateVolatilityHeatmap,
  MOCK_RISK_METRICS,
} from '../../../data/mockMetrics.js';

const metricsApi = new Hono()
  .get('/kpis', (c) => c.json(MOCK_KPIS, 200))
  .get('/allocation', (c) => c.json(MOCK_ASSET_ALLOCATION, 200))
  .get('/performance', (c) => {
    const days = Number(c.req.query('days') || '30');
    return c.json(generatePerformanceHistory(days), 200);
  })
  .get('/heatmap', (c) => {
    const year = Number(c.req.query('year') || new Date().getFullYear());
    return c.json(generateVolatilityHeatmap(year), 200);
  })
  .get('/drawdown', (c) => {
    const days = Number(c.req.query('days') || '30');
    return c.json(generateDrawdownCurve(days), 200);
  })
  .get('/risk', (c) => c.json(MOCK_RISK_METRICS, 200))
  .get('/token/:symbol', (c) => c.json({}, 200));

export default metricsApi;
