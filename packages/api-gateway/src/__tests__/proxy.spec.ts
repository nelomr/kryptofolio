import { describe, it, expect, vi } from 'vitest';
import { app } from '../index.ts';

describe('BFF Proxy Middleware', () => {
  it('passes through to mock routes when MODE=mock', async () => {
    // In Hono, we can pass a mock environment object as the second argument to app.request in some runtimes,
    // or as the third argument bindings in the fetch adapter. We'll use the Env bindings object.
    const res = await app.request('/api/portfolio/summary', {}, { MODE: 'mock' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('metrics');
  });

  it('attempts to proxy to PROD_API_URL when MODE=prod', async () => {
    // Mock global.fetch to prevent network timeouts during testing
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Mock network failure'));

    try {
      const res = await app.request('/api/portfolio/summary', {
          method: 'GET'
      }, { 
          MODE: 'prod', 
          PROD_API_URL: 'http://test-prod-api.local' 
      });
      
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toBe('Proxy Request Failed');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://test-prod-api.local/api/portfolio/summary',
        expect.anything()
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
