import { describe, it, expect } from 'vitest';
import { app } from '../index.ts';

describe('BFF Mock Routes', () => {
  it('GET /api/portfolio/summary returns 200 OK and mock summary data', async () => {
    const res = await app.request('/api/portfolio/summary');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('metrics');
    expect(data).toHaveProperty('holdings');
  });

  it('GET /api/wallets returns 200 OK and mock wallets data', async () => {
    const res = await app.request('/api/wallets');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/tax/transactions/spot returns 200 OK and mock transactions data', async () => {
    const res = await app.request('/api/tax/transactions/spot');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/tax/report returns 200 OK and mock tax report', async () => {
    const res = await app.request('/api/tax/report');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toHaveProperty('capital_gains_eur');
    expect(data).toHaveProperty('audit_trail');
  });

  it('GET /api/metrics/performance returns 200 OK and performance data', async () => {
    const res = await app.request('/api/metrics/performance?days=30');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data)).toBe(true);
    expect(data).toHaveProperty('summary');
  });

  it('GET /api/metrics/drawdown returns 200 OK and consistent drawdown data', async () => {
    const res = await app.request('/api/metrics/drawdown?days=30');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('ts');
    expect(data[0]).toHaveProperty('drawdown_percent');
    // Ensure all points have drawdown_percent <= 0
    data.forEach((p: any) => {
      expect(p.drawdown_percent).toBeLessThanOrEqual(0);
    });
  });
});
