/**
 * useTaxLedgers#handleEdit (design.md D9): opens the edit dialog for the row's id_hash instead
 * of the disabled-toast stub.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-sonner', () => ({
  toast: { info: vi.fn() },
}))

vi.mock('@/composables/queries/useTaxQueries', () => ({
  useSpotTransactionsQuery: () => ({ data: ref([]), isLoading: ref(false) }),
  useFuturesTransactionsQuery: () => ({ data: ref([]), isLoading: ref(false) }),
  useFuturesDerivativesQuery: () => ({ data: ref([]), isLoading: ref(false) }),
  useAvailableYearsQuery: () => ({ data: ref([2026]), isLoading: ref(false) }),
}))

const { useTaxLedgers } = await import('../useTaxLedgers')
const { toast } = await import('vue-sonner')

describe('useTaxLedgers#handleEdit', () => {
  it('opens the edit dialog (sets editingIdHash) for a spot row, without the disabled toast', () => {
    const { handleEdit, editingIdHash } = useTaxLedgers()
    expect(editingIdHash.value).toBeNull()

    handleEdit({ id: 'tx-1', idHash: 'hash-1' } as never)

    expect(editingIdHash.value).toBe('hash-1')
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('closeEdit clears editingIdHash', () => {
    const { handleEdit, closeEdit, editingIdHash } = useTaxLedgers()
    handleEdit({ id: 'tx-1', idHash: 'hash-1' } as never)
    expect(editingIdHash.value).toBe('hash-1')

    closeEdit()

    expect(editingIdHash.value).toBeNull()
  })
})
