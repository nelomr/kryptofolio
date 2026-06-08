import { describe, it, expect } from 'vitest';
import { app } from '../index';

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
    expect(data.summary).toHaveProperty('capitalGainsEur');
    expect(data).toHaveProperty('auditTrail');
  });
});
