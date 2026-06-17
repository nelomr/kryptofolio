import { describe, it, expect, vi } from 'vitest'
import { useImportProcessor } from '../useImportProcessor'
import * as taxMutations from '@/composables/queries/useTaxMutations'

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
    } as any)

    const { isProcessing, processingErrors, processAndSubmit } = useImportProcessor()

    const rows = [
      { id: '1', mappedData: { date: '2023-01-01', time: '00:00:00' } } as any
    ]

    const result = await processAndSubmit(rows, 'spot')

    expect(result).toBe(true)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toEqual([])
    
    expect(mockMutateAsync).toHaveBeenCalledWith({
      market: 'spot',
      rows: [
        { id: '1', mappedData: { timestamp: '2023-01-01T00:00:00Z', metadata: {} }, id_hash: 'mocked-hash-123' }
      ],
      timezone: 'UTC'
    })
  })

  it('should return error if no rows provided', async () => {
    const { processAndSubmit, processingErrors } = useImportProcessor()
    
    const result = await processAndSubmit([], 'spot')
    
    expect(result).toBe(false)
    expect(processingErrors.value).toContain('ingestion.errors.no_valid_rows_to_import')
  })

  it('should handle submission errors gracefully', async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync
    } as any)

    const { processAndSubmit, processingErrors, isProcessing } = useImportProcessor()

    const result = await processAndSubmit([{ id: '1', mappedData: {} } as any], 'spot')

    expect(result).toBe(false)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toContain('Network error')
  })
})
