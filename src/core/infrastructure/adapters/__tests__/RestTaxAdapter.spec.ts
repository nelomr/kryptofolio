/**
 * RestTaxAdapter — Vitest unit tests for new operational methods (TDD red phase)
 * Tests uploadTaxFile and deleteAllTransactions via mocked IHttpClient.
 *
 * @see openspec/changes/tax-domain-ports-services/specs/tax-csv-ingestion/spec.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RestTaxAdapter } from '../RestTaxAdapter'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'
import type { IHttpClient } from '@/core/domain/repositories/IHttpClient'

// ---------------------------------------------------------------------------
// Mock IHttpClient
// ---------------------------------------------------------------------------

function makeHttp(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    postForm: vi.fn().mockResolvedValue({ data: {} }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// uploadTaxFile — happy path
// ---------------------------------------------------------------------------

describe('RestTaxAdapter.uploadTaxFile() — happy path', () => {
  it('sends a multipart POST to /api/tax/upload', async () => {
    const http = makeHttp()
    const adapter = new RestTaxAdapter(http)
    const file = new File(['txid,refid'], 'test.csv', { type: 'text/csv' })

    await adapter.uploadTaxFile(file)

    expect(http.postForm).toHaveBeenCalledOnce()
    const [url, formData] = (http.postForm as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/tax/upload')
    expect(formData).toBeInstanceOf(FormData)
  })

  it('resolves void on success', async () => {
    const http = makeHttp()
    const adapter = new RestTaxAdapter(http)
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    await expect(adapter.uploadTaxFile(file)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// uploadTaxFile — error path
// ---------------------------------------------------------------------------

describe('RestTaxAdapter.uploadTaxFile() — error path', () => {
  it('throws TaxOperationError with code UPLOAD_FAILED on HTTP error', async () => {
    const http = makeHttp({
      postForm: vi.fn().mockRejectedValue(new Error('Network error')),
    })
    const adapter = new RestTaxAdapter(http)
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })

    await expect(adapter.uploadTaxFile(file)).rejects.toThrow(TaxOperationError)
    await expect(adapter.uploadTaxFile(file)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })
})

// ---------------------------------------------------------------------------
// deleteAllTransactions — happy path
// ---------------------------------------------------------------------------

describe('RestTaxAdapter.deleteAllTransactions() — happy path', () => {
  it('sends a DELETE to /api/tax/transactions', async () => {
    const http = makeHttp()
    const adapter = new RestTaxAdapter(http)

    await adapter.deleteAllTransactions()

    expect(http.delete).toHaveBeenCalledWith('/api/tax/transactions')
  })

  it('resolves void on success', async () => {
    const http = makeHttp()
    const adapter = new RestTaxAdapter(http)
    await expect(adapter.deleteAllTransactions()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// deleteAllTransactions — error path
// ---------------------------------------------------------------------------

describe('RestTaxAdapter.deleteAllTransactions() — error path', () => {
  it('throws TaxOperationError with code DELETE_FAILED on HTTP error', async () => {
    const http = makeHttp({
      delete: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
    })
    const adapter = new RestTaxAdapter(http)

    await expect(adapter.deleteAllTransactions()).rejects.toThrow(TaxOperationError)
    await expect(adapter.deleteAllTransactions()).rejects.toMatchObject({ code: 'DELETE_FAILED' })
  })
})
