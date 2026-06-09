import { describe, it, expect, vi } from 'vitest'
import { useAvailableYears } from '../useAvailableYears'
import { ref } from 'vue'

// Mock the query
vi.mock('@/composables/queries/useTaxQueries', () => ({
  useAvailableYearsQuery: vi.fn(() => ({
    data: ref([2024, 2023])
  }))
}))

describe('useAvailableYears', () => {
  it('returns the data from the query', () => {
    const availableYears = useAvailableYears()
    expect(availableYears.value).toEqual([2024, 2023])
  })
})
