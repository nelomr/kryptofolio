import { describe, it, expect } from 'vitest';
import { app } from '../index.ts';
import type { AppType } from '../index.ts';
import { hc } from 'hono/client';

describe('Scaffold Hono BFF', () => {
  it('Running the BFF: GET /api/health should return 200 OK', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('Export AppType: Type consumption works correctly', () => {
    // Static type check plus runtime check
    const client = hc<AppType>('http://localhost');
    expect(client.api.health.$get).toBeDefined();
  });
});
