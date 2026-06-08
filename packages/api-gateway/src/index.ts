import { serve } from '@hono/node-server';
import { Hono } from 'hono';

export const app = new Hono();

const routes = app.get('/api/health', (c) => {
  return c.json({ status: 'ok' }, 200);
});

export type AppType = typeof routes;

const port = 3001;
if (process.env.NODE_ENV !== 'test') {
  console.log(`BFF is running on port ${port}`);
  serve({
    fetch: app.fetch,
    port
  });
}
