import { describe, it, expect, vi } from 'vitest'
import { useImportProcessor } from '../useImportProcessor'
import * as taxMutations from '@/composables/queries/useTaxMutations'
import type { ValidTransactionRow } from '@kryptofolio/shared-types'

vi.mock('@/composables/queries/useTaxMutations', () => ({
  useSubmitIngestionMutation: vi.fn()
}))

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
    const result = await processAndSubmit(rows, 'spot', '10000000-0000-0000-0000-000000000001', 'kraken-spot')

    expect(result).toBe(true)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toEqual([])
    
    /**
     * The row goes out as the source wrote it, plus the account. Classification, aggregation, the
     * identifier and the instant all happen behind the ingestion boundary now, so the payload still
     * carries `date` and `time` and carries neither `id_hash` nor `timestamp` — converting here and
     * again behind the boundary is how the chosen timezone was lost.
     */
    expect(mockMutateAsync).toHaveBeenCalledWith({
      market: 'spot',
      rows: [
        {
          id: '1',
          originalData: {},
          errors: [],
          hasError: false,
          mappedData: {
            tx_type: null,
            date: '2023-01-01',
            time: '00:00:00',
            account_id: '10000000-0000-0000-0000-000000000001',
            metadata: {},
          },
        }
      ],
      timezone: 'UTC',
      sourceProfileId: 'kraken-spot'
    })
  })

  it('should return error if no rows provided', async () => {
    const { processAndSubmit, processingErrors } = useImportProcessor()

    const result = await processAndSubmit([], 'spot', '10000000-0000-0000-0000-000000000001', 'kraken-spot')
    
    expect(result).toBe(false)
    expect(processingErrors.value).toContain('ingestion.errors.no_valid_rows_to_import')
  })

  /**
   * A group whose legs carry fees in two different units cannot be merged into a shape that holds one
   * fee, and the aggregator refuses it. It refuses it behind the ingestion boundary now, so what this
   * side owes is to submit both legs unchanged: the refusal is reported back as a rejected row, and the
   * rest of the batch is still persisted rather than stopped. The refusal itself is asserted in
   * `apps/backend/.../__tests__/ingestionBoundary.spec.ts`.
   */
  it('submits the legs of a conflicting group as written, leaving the refusal to the backend', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(true)
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync
    } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)

    const { processAndSubmit, processingErrors } = useImportProcessor()

    const leg = (id: string, over: Partial<ValidTransactionRow['mappedData']>): ValidTransactionRow => ({
      id,
      originalData: {},
      errors: [],
      hasError: false,
      mappedData: {
        date: '2025-03-01',
        time: '10:00:00',
        tx_type: 'trade',
        group_id: 'REF-FEE',
        metadata: {},
        ...over,
      },
    })

    const result = await processAndSubmit(
      [
        leg('a', { amount: '-50', asset: 'EUR', fee_amount: '0.05' }),
        leg('b', { amount: '7704.16', asset: 'PUMP', fee_amount: '17.720' }),
      ],
      'spot',
      '10000000-0000-0000-0000-000000000001',
      'kraken-spot',
    )

    expect(result).toBe(true)
    expect(processingErrors.value).toEqual([])
    const [{ rows }] = mockMutateAsync.mock.calls[0] as [{ rows: Array<{ id: string }> }]
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
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
    const result = await processAndSubmit([errorRow], 'spot', '10000000-0000-0000-0000-000000000001', 'kraken-spot')

    expect(result).toBe(false)
    expect(isProcessing.value).toBe(false)
    expect(processingErrors.value).toContain('Network error')
  })
})
