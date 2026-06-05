import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CryptoKpiCards from '@/views/Portfolio/components/metrics/CryptoKpiCards.vue'
import { ref } from 'vue'
import { CRYPTO_METRICS_REPO_KEY, I18N_PORT_KEY } from '@/core/injectionKeys'

vi.mock('@pinia/colada', () => {
  return {
    useQuery: vi.fn(() => {
      // Mock colada response
      return {
        data: ref({
          totalRoiPercent: 15.5,
          totalRoiFiat: 1500,
          delta24hFiat: 100,
          investedFiat: 8500,
          maxDrawdownPercent: -5.2,
          maxDrawdownFiat: -500,
          recoveredFiat: 100,
          winRatePercent: 65,
          winningTrades: 13,
          losingTrades: 7,
          totalTrades: 20,
          averageR: 1.5,
          portfolioDispersion: 12.3,
          bestAsset: { symbol: 'BTC', name: 'Bitcoin', allocationPercent: 50, roiPercent: 25.5 },
          worstAsset: { symbol: 'XRP', name: 'Ripple', allocationPercent: 10, roiPercent: -15.5 }
        }),
        isLoading: ref(false),
        error: ref(null)
      }
    })
  }
})

describe('CryptoKpiCards.vue', () => {
  const globalMocks = {
    provide: {
      [CRYPTO_METRICS_REPO_KEY as symbol]: {
        getKpis: vi.fn()
      },
      [I18N_PORT_KEY as symbol]: {
        translate: (key: string) => key,
        setLanguage: vi.fn(),
        getCurrentLanguage: vi.fn().mockReturnValue('en')
      }
    }
  }

  it('renders correctly with colada data', () => {
    const wrapper = mount(CryptoKpiCards, { global: globalMocks })
    
    // Check if it renders the 4 cards by looking at specific text that the mock provides
    expect(wrapper.text()).toContain('BTC')
    expect(wrapper.text()).toContain('XRP')
    // formatPercent adds a + if positive
    expect(wrapper.text()).toContain('+15.50%')
  })

  it('throws an error if ICryptoMetricsRepository is not provided', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    expect(() => {
      mount(CryptoKpiCards, {
        global: {
          provide: {
            [I18N_PORT_KEY as symbol]: globalMocks.provide[I18N_PORT_KEY as symbol]
          }
        }
      })
    }).toThrow('ICryptoMetricsRepository not provided')

    consoleErrorSpy.mockRestore()
  })
})
