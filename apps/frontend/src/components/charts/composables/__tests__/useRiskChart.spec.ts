import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useRiskChart } from '../useRiskChart'

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    inject: vi.fn().mockImplementation((key) => {
      if (key.toString() === 'Symbol(I18nPort)') {
        return {
          translate: (k: string) => k,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue('es')
        }
      }
      return actual.inject(key)
    })
  }
})

describe('useRiskChart', () => {
  it('should return correct sharpeColor based on last history value', () => {
    const historyRef = ref<number[]>([])
    const { sharpeColor } = useRiskChart(historyRef)
    
    // Empty history -> muted
    expect(sharpeColor.value).toBe('var(--muted)')
    
    // Last value <= 0 -> loss
    historyRef.value = [1, 2, -0.5]
    expect(sharpeColor.value).toBe('var(--loss)')
    
    // Last value >= 1 -> profit
    historyRef.value = [-1, 0, 1.2]
    expect(sharpeColor.value).toBe('var(--profit)')
    
    // Last value between 0 and 1 -> muted
    historyRef.value = [2, 3, 0.5]
    expect(sharpeColor.value).toBe('var(--muted)')
  })

  it('should compute chartData correctly from history', () => {
    const historyRef = ref([1.5, 2.0, 1.8])
    const { chartData } = useRiskChart(historyRef)
    
    expect(chartData.value.labels).toHaveLength(3)
    expect(chartData.value.labels?.[0]).toBe('Point 1')
    expect(chartData.value.datasets[0].data).toEqual([1.5, 2.0, 1.8])
  })

  it('should compute chartOptions scales correctly based on history', () => {
    const historyRef = ref([-1.0, 2.0, 1.0])
    const { chartOptions } = useRiskChart(historyRef)
    
    const yMax = chartOptions.value.scales?.y?.max as number
    const yMin = chartOptions.value.scales?.y?.min as number
    
    expect(yMax).toBeGreaterThanOrEqual(2.0)
    expect(yMin).toBeLessThanOrEqual(-1.0)
  })
})
