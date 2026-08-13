/**
 * A currency switch is a re-read, not a reload.
 *
 * The display currency lives in the vault and the summary is resolved server-side, so switching it
 * has to invalidate the summary query and let Pinia Colada refetch. Nothing may reach for
 * `location.reload()`, and no global store may hold the server figures — the cache is the store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { usePortfolioSummaryQuery } from '@/composables/queries/usePortfolioQueries'
import { useUpdateBaseCurrencyMutation } from '@/composables/queries/useSettingsMutations'
import { PORTFOLIO_PORT_KEY, SETTINGS_PORT_KEY, I18N_PORT_KEY } from '@/core/injectionKeys'
import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort'
import type { PortfolioSummaryEntity } from '@/core/domain/models/PortfolioEntities'
import type { AssetId } from '@/core/domain/models/BrandedTypes'

vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function summaryIn(currency: 'USD' | 'EUR'): PortfolioSummaryEntity {
  return {
    metrics: {
      totalEquityFiat: currency === 'USD' ? 1200 : 1100,
      totalCostBasisFiat: currency === 'USD' ? 1000 : 920,
      totalRealizedPnlFiat: 0,
      totalUnrealizedPnlFiat: 200,
      totalPnlFiat: 200,
      currency,
      roiPercentage: 20,
      isBullish: true,
      realizedIsPositive: true,
      ratesIncomplete: false,
      pricesIncomplete: false,
    },
    holdings: [
      {
        id: 'asset-1' as AssetId,
        symbol: 'BTC',
        amount: 1,
        avgPriceFiat: 1000,
        currentValueFiat: currency === 'USD' ? 1200 : 1100,
        costBasisFiat: currency === 'USD' ? 1000 : 920,
        unrealizedPnlFiat: 200,
        pnlFiat: 200,
        currency,
        portfolioLocations: ['Kraken'],
        costBasis:
          currency === 'USD'
            ? { kind: 'NATIVE', amount: '1000.00', currency: 'USD' }
            : {
                kind: 'CONVERTED',
                amount: '920.00',
                currency: 'EUR',
                rate: '0.92',
                rateDate: '2024-03-14',
              },
      },
    ],
  }
}

describe('switching the display currency re-reads through Pinia Colada (task 9.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('refetches the summary and renders the new currency without a page reload', async () => {
    let served: 'USD' | 'EUR' = 'USD'
    const getSummary = vi.fn(async () => summaryIn(served))

    const portfolioPort = { getSummary } as unknown as ICryptoPortfolioPort
    const settingsPort = {
      setBaseCurrency: vi.fn(async () => {
        served = 'EUR'
      }),
    } as unknown as ISettingsPort

    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    // Mounted rather than called bare: Colada refetches the entries a live component subscribes to,
    // which is the behaviour under test — an invalidation nobody is watching proves nothing.
    let summary!: ReturnType<typeof usePortfolioSummaryQuery>
    let mutation!: ReturnType<typeof useUpdateBaseCurrencyMutation>

    const app = createApp({
      setup() {
        summary = usePortfolioSummaryQuery()
        mutation = useUpdateBaseCurrencyMutation()
        return () => h('div', summary.data.value?.metrics.currency ?? '')
      },
    })
    app.use(createPinia())
    app.use(PiniaColada)
    app.provide(PORTFOLIO_PORT_KEY, portfolioPort)
    app.provide(SETTINGS_PORT_KEY, settingsPort)
    app.provide(I18N_PORT_KEY, {
      translate: (key: string) => key,
      setLocale: vi.fn(),
      getLocale: () => 'en',
      getSupportedLocales: () => [],
    })

    const host = document.createElement('div')
    document.body.appendChild(host)
    app.mount(host)

    await new Promise((r) => setTimeout(r, 20))
    expect(getSummary).toHaveBeenCalledTimes(1)
    expect(summary.data.value?.metrics.currency).toBe('USD')

    await mutation.mutateAsync('EUR')
    await nextTick()
    await new Promise((r) => setTimeout(r, 20))

    expect(getSummary).toHaveBeenCalledTimes(2)
    expect(summary.data.value?.metrics.currency).toBe('EUR')
    expect(summary.data.value?.holdings[0].costBasis.kind).toBe('CONVERTED')
    expect(host.textContent).toBe('EUR')
    expect(reload).not.toHaveBeenCalled()
  })
})
