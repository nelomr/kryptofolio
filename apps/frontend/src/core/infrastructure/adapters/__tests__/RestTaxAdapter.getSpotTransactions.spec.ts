/**
 * RestTaxAdapter#getSpotTransactions — regression test.
 *
 * `ExternalTaxTransactionSchema` (the wire-level DTO parser) carries `idHash`/`fiatCurrency`/
 * `override`, and `TaxTransactionEntity` declares them too, but `getSpotTransactions()` rebuilds
 * its return value as a hand-picked object literal rather than spreading the parsed DTO — a
 * second mapping layer that silently dropped these three fields on every row. The edit affordance
 * (`useTaxLedgers#handleEdit`) keys off `tx.idHash` being truthy, so this defect made every Ledgers
 * row look edit-disabled even though the backend and the DTO layer both carried the identity.
 */

import { describe, it, expect, vi } from 'vitest'
import { RestTaxAdapter } from '../RestTaxAdapter'

vi.mock('../../http/BffClient', () => {
  return {
    bffClient: {
      api: {
        tax: {
          transactions: {
            spot: {
              $get: vi.fn(),
            },
          },
        },
      },
    },
  }
})

const RAW_SPOT_ROW = {
  id: 'tx-1',
  id_hash: '0c03e9dd456605ba58b85dec6f22db097f6f7e231d7d90c5c446c0ee8e8edc36',
  account_id: 'acc-1',
  exchange: 'Bitvavo',
  tx_type: 'BUY',
  asset_in_id: 'XRP',
  amount_in: '98.703571',
  fee_asset_id: 'EUR',
  fee_amount: '0.230761379',
  total_fiat: '153.089238621',
  price_fiat: '1.551',
  fiat_currency: 'EUR',
  timestamp: '2025-12-30T23:00:00.000Z',
  status: 'COMPLETED',
  override: { kind: 'NONE' as const },
}

describe('RestTaxAdapter#getSpotTransactions', () => {
  it('carries idHash, fiatCurrency, and override through to the returned entity', async () => {
    const { bffClient } = await import('../../http/BffClient')
    vi.mocked(bffClient.api.tax.transactions.spot.$get).mockResolvedValue({
      json: () => Promise.resolve([RAW_SPOT_ROW]),
    } as never)

    const adapter = new RestTaxAdapter()
    const [tx] = await adapter.getSpotTransactions()

    expect(tx?.idHash).toBe(RAW_SPOT_ROW.id_hash)
    expect(tx?.fiatCurrency).toBe('EUR')
    expect(tx?.override).toEqual({ kind: 'NONE' })
  })
})
