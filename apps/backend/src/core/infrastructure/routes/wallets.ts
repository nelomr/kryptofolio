import { Hono } from 'hono';

const walletsApi = new Hono()
  .get('/', (c) =>
    c.json([{ name: 'Main Kraken', type: 'EXCHANGE', chainAddresses: [] }], 200),
  )
  .post('/upload', (c) =>
    c.json([{ name: 'Imported', type: 'WALLET', chainAddresses: [] }], 200),
  );

export default walletsApi;
