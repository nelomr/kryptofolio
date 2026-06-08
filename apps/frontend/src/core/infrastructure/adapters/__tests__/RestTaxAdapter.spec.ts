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
        }
      }
    }
  }
})

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
