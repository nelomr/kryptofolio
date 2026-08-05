/**
 * RestTaxAdapter — Vitest unit tests for new operational methods (TDD red phase)
 * Tests uploadTaxFile and deleteAllTransactions via mocked bffClient.
 *
 * @see openspec/specs/tax-csv-ingestion/spec.md
 */

import { describe, it, expect, vi } from 'vitest'
import { RestTaxAdapter } from '../RestTaxAdapter'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'

vi.mock('../../http/BffClient', () => {
  return {
    bffClient: {
      api: {
        tax: {
          upload: {
            $post: vi.fn()
          },
          transactions: {
            market: {
              ':market': {
                $delete: vi.fn()
              }
            }
          }
        },
        ingestion: {
          transactions: {
            $post: vi.fn()
          }
        }
      }
    }
  }
})

/** A minimally valid ingestion outcome — every field the response schema requires, nothing more. */
const VALID_INGESTION_OUTCOME = {
  status: 'success' as const,
  processedCount: 1,
  message: 'ok',
  materialized: false,
  materialization: null,
  materializationError: null,
  pendingReview: 0,
  rejected: [],
  unresolvedFiat: 0,
  pendingFeeReview: [],
}

describe('RestTaxAdapter.uploadTaxFile() — happy path', () => {
  it('sends a multipart POST to bffClient.api.tax.upload', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.upload.$post.mockResolvedValueOnce({ ok: true })
    
    const adapter = new RestTaxAdapter()
    const file = new File(['txid,refid'], 'test.csv', { type: 'text/csv' })

    await adapter.uploadTaxFile(file, 'spot')

    // @ts-ignore
    expect(bffClient.api.tax.upload.$post).toHaveBeenCalledOnce()
    // @ts-ignore
    const arg = bffClient.api.tax.upload.$post.mock.calls[0][0]
    expect(arg).toHaveProperty('form')
    expect(arg.form.file).toBeInstanceOf(File)
  })

  it('resolves void on success', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.upload.$post.mockResolvedValueOnce({ ok: true })
    
    const adapter = new RestTaxAdapter()
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    await expect(adapter.uploadTaxFile(file, 'spot')).resolves.toBeUndefined()
  })
})

describe('RestTaxAdapter.uploadTaxFile() — error path', () => {
  it('throws TaxOperationError with code UPLOAD_FAILED on HTTP error', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.upload.$post.mockRejectedValue(new Error('Network error'))
    
    const adapter = new RestTaxAdapter()
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })

    await expect(adapter.uploadTaxFile(file, 'spot')).rejects.toThrow(TaxOperationError)
    await expect(adapter.uploadTaxFile(file, 'spot')).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })
})

describe('RestTaxAdapter.deleteAllTransactions() — happy path', () => {
  it('sends a DELETE to bffClient.api.tax.transactions.market', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.transactions.market[':market'].$delete.mockResolvedValueOnce({ ok: true })
    
    const adapter = new RestTaxAdapter()

    await adapter.deleteAllTransactions('spot')

    // @ts-ignore
    expect(bffClient.api.tax.transactions.market[':market'].$delete).toHaveBeenCalledWith({ param: { market: 'spot' } })
  })

  it('resolves void on success', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.transactions.market[':market'].$delete.mockResolvedValueOnce({ ok: true })
    
    const adapter = new RestTaxAdapter()
    await expect(adapter.deleteAllTransactions('spot')).resolves.toBeUndefined()
  })
})

describe('RestTaxAdapter.deleteAllTransactions() — error path', () => {
  it('throws TaxOperationError with code DELETE_FAILED on HTTP error', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.tax.transactions.market[':market'].$delete.mockRejectedValue(new Error('500 Internal Server Error'))
    
    const adapter = new RestTaxAdapter()

    await expect(adapter.deleteAllTransactions('spot')).rejects.toThrow(TaxOperationError)
    await expect(adapter.deleteAllTransactions('spot')).rejects.toMatchObject({ code: 'DELETE_FAILED' })
  })
})

// ---------------------------------------------------------------------------
// importTransactions — regression guard for the /api/ingestion/transactions fix
// These tests verify that the adapter calls the REAL ingestion endpoint
// (api.ingestion.transactions), NOT the old tax stub (api.tax.import).
// ---------------------------------------------------------------------------

describe('RestTaxAdapter.importTransactions() — happy path', () => {
  it('POSTs to bffClient.api.ingestion.transactions (not api.tax.import)', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_INGESTION_OUTCOME),
    })

    const adapter = new RestTaxAdapter()
    const rows = [
      {
        mappedData: {
          tx_type: 'BUY',
          asset_in: 'BTC',
          amount_in: '1',
          account_id: '00000000-0000-0000-0000-000000000001',
        },
      },
    ] as unknown as Parameters<RestTaxAdapter['importTransactions']>[0]

    await adapter.importTransactions(rows, 'spot', 'UTC', 'kraken-spot')

    // @ts-ignore
    expect(bffClient.api.ingestion.transactions.$post).toHaveBeenCalledOnce()
  })

  it('sends rows with mappedData flattened, without a client-supplied id_hash', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_INGESTION_OUTCOME),
    })

    const adapter = new RestTaxAdapter()
    const rows = [
      {
        id_hash: 'hash-xyz',
        account_id: '00000000-0000-0000-0000-000000000001',
        mappedData: { tx_type: 'SELL', asset_out: 'ETH', amount_out: '2', account_id: '00000000-0000-0000-0000-000000000001' },
      },
    ] as unknown as Parameters<RestTaxAdapter['importTransactions']>[0]

    await adapter.importTransactions(rows, 'spot', 'Europe/Madrid', 'kraken-spot')

    // @ts-ignore
    const call = bffClient.api.ingestion.transactions.$post.mock.lastCall[0]
    expect(call.json.rows[0]).toMatchObject({ tx_type: 'SELL' })
    expect(call.json.rows[0]).not.toHaveProperty('id_hash')
    expect(call.json.market).toBe('spot')
    expect(call.json.timezone).toBe('Europe/Madrid')
  })

  it('folds a null mapped field to undefined instead of sending null', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(VALID_INGESTION_OUTCOME),
    })

    const adapter = new RestTaxAdapter()
    const rows = [
      {
        mappedData: {
          tx_type: null,
          asset_in: 'BTC',
          amount_in: '1',
          account_id: '00000000-0000-0000-0000-000000000001',
        },
      },
    ] as unknown as Parameters<RestTaxAdapter['importTransactions']>[0]

    await adapter.importTransactions(rows, 'spot', 'UTC', 'kraken-spot')

    // @ts-ignore
    const call = bffClient.api.ingestion.transactions.$post.mock.lastCall[0]
    expect(call.json.rows[0].tx_type).toBeUndefined()
    expect('tx_type' in call.json.rows[0] ? call.json.rows[0].tx_type : undefined).toBeUndefined()
  })

  it('rejects a row with no account assigned rather than sending an incomplete row', async () => {
    const adapter = new RestTaxAdapter()
    const rows = [
      {
        mappedData: { tx_type: 'BUY', asset_in: 'BTC', amount_in: '1', account_id: null },
      },
    ] as unknown as Parameters<RestTaxAdapter['importTransactions']>[0]

    await expect(
      adapter.importTransactions(rows, 'spot', 'UTC', 'kraken-spot'),
    ).rejects.toMatchObject({ code: 'IMPORT_FAILED' })
  })

  it('resolves the parsed outcome on success', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...VALID_INGESTION_OUTCOME, processedCount: 0 }),
    })

    const adapter = new RestTaxAdapter()
    const outcome = await adapter.importTransactions([], 'futures', 'UTC', 'kraken-futures')
    expect(outcome.processedCount).toBe(0)
    expect(outcome.pendingFeeReview).toEqual([])
  })

  it('surfaces rows whose fee could not be resolved, distinct from a rejected row', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...VALID_INGESTION_OUTCOME,
          pendingFeeReview: [
            { idHash: 'fee-1', timestamp: '2024-01-01T00:00:00Z', reason: "could not verify Bitvavo's fee convention" },
          ],
        }),
    })

    const adapter = new RestTaxAdapter()
    const outcome = await adapter.importTransactions([], 'spot', 'UTC', 'kraken-spot')
    expect(outcome.pendingFeeReview).toHaveLength(1)
    expect(outcome.pendingFeeReview[0].reason).toContain('Bitvavo')
    expect(outcome.rejected).toEqual([])
  })
})

describe('RestTaxAdapter.importTransactions() — error path', () => {
  it('throws TaxOperationError with code IMPORT_FAILED on HTTP error', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-ignore
    bffClient.api.ingestion.transactions.$post.mockRejectedValue(new Error('503 Service Unavailable'))

    const adapter = new RestTaxAdapter()

    await expect(adapter.importTransactions([], 'spot', 'UTC', 'kraken-spot')).rejects.toThrow(TaxOperationError)
    await expect(adapter.importTransactions([], 'spot', 'UTC', 'kraken-spot')).rejects.toMatchObject({ code: 'IMPORT_FAILED' })
  })
})
