import { Hono } from 'hono';

const ingestionApi = new Hono()
  .get('/status', (c) =>
    c.json(
      { status: 'idle', progress: 0, message: '', processedCount: 0, totalCount: 0 },
      200,
    ),
  );

export default ingestionApi;
