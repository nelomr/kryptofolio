import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { TransactionMappedData } from '@kryptofolio/shared-types'
import { normalizeTransactionDirection } from '@kryptofolio/core-domain'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from Hono backend!')
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
