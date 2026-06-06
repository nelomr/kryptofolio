import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatCurrency, formatPercent } from '@/composables/useFormatters'

describe('useFormatters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats currency values correctly using detected locale', () => {
    // Mock navigator.language to ensure stable test
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
    
    const result = formatCurrency(1234.56)
    
    // In node/happy-dom with limited Intl, the exact output might vary slightly 
    // but should contain the euro symbol and numbers.
    const normalized = result.replace(/\s/g, '').replace(/\u00A0/g, '')
    expect(normalized).toMatch(/1[.,]?234[.,]56/)
    expect(normalized).toContain('€')
  })

  it('formats percentage values correctly with 2 decimal places', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    
    // positive (12.345% passed as 12.345, output should be 12.35%)
    // Wait, the composable divides by 100 before passing to Intl. So 12.345 / 100 = 0.12345.
    // Wait, the test I wrote passed 0.12345 directly to formatPercent. Let's see if formatPercent divides by 100.
    // The composable has:
    // return new Intl.NumberFormat(locale, {...}).format(numValue / 100)
    // So if I pass 12.345, it does 0.12345, Intl renders 12.35%
    expect(formatPercent(12.345)).toBe('12.35%')
    
    // negative
    expect(formatPercent(-5)).toBe('-5.00%')
    
    // zero
    expect(formatPercent(0)).toBe('0.00%')
  })
})
