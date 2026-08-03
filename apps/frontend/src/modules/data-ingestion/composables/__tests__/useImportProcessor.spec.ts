import { describe, it, expect, vi } from 'vitest'
import { useImportProcessor } from '../useImportProcessor'
import * as taxMutations from '@/composables/queries/useTaxMutations'
import type { ValidTransactionRow } from '@kryptofolio/shared-types'

vi.mock('@/composables/queries/useTaxMutations', () => ({
  useSubmitIngestionMutation: vi.fn()
}))

vi.mock('@kryptofolio/core-domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kryptofolio/core-domain')>()
  return {
    ...actual,
    generateIdHash: vi.fn().mockResolvedValue('mocked-hash-123')
  }
})

describe('useImportProcessor', () => {
  it('should process and submit rows correctly', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(true)
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync
    } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)

    const { isProcessing, processingErrors, processAndSubmit } = useImportProcessor()

    const rows: ValidTransactionRow[] = [
      {
        id: '1',
        originalData: {},
        mappedData: { tx_type: null, date: '2023-01-01', time: '00:00:00', metadata: {} },
        errors: [],
        hasError: false,
      }
    ]
    const result = await processAndSubmit(rows, 'spot', '10000000-0000-0000-0000-000000000001')

    expect(result).toBe(true)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toEqual([])
    
    expect(mockMutateAsync).toHaveBeenCalledWith({
      market: 'spot',
      rows: [
        {
          id: '1',
          originalData: {},
          errors: [],
          hasError: false,
          mappedData: { tx_type: null, account_id: '10000000-0000-0000-0000-000000000001', timestamp: '2023-01-01T00:00:00Z', metadata: {} },
          id_hash: 'mocked-hash-123'
        }
      ],
      timezone: 'UTC'
    })
  })

  it('should return error if no rows provided', async () => {
    const { processAndSubmit, processingErrors } = useImportProcessor()

    const result = await processAndSubmit([], 'spot', '10000000-0000-0000-0000-000000000001')
    
    expect(result).toBe(false)
    expect(processingErrors.value).toContain('ingestion.errors.no_valid_rows_to_import')
  })

  it('should handle submission errors gracefully', async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync
    } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)

    const { isProcessing, processingErrors, processAndSubmit } = useImportProcessor()

    const errorRow: ValidTransactionRow = {
      id: '1',
      originalData: {},
      mappedData: { tx_type: null, metadata: {} },
      errors: [],
      hasError: false,
    }
    const result = await processAndSubmit([errorRow], 'spot', '10000000-0000-0000-0000-000000000001')

    expect(result).toBe(false)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toContain('Network error')
  })
})
