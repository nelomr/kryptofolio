/**
 * Unit Tests — usePortfolioData composable (Pinia Colada Migration)
 *
 * UPDATED: Tests now inject a mock ICryptoPortfolioPort and rely on
 * @pinia/colada for async state management. The manual store is gone.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { PiniaColada } from '@pinia/colada'
import { usePortfolioData } from '@/views/Portfolio/composables/usePortfolioData'
import { PORTFOLIO_PORT_KEY } from '@/core/injectionKeys'
import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { PortfolioSummaryEntity } from '@/core/domain/models/PortfolioEntities'
import { AssetIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

const mockSummary: PortfolioSummaryEntity = {
  metrics: {
    totalEquityEur: 100000,
    totalCostBasisEur: 90000,
    totalRealizedPnlEur: 5000,
    totalUnrealizedPnlEur: 5000,
    totalPnlEur: 10000,
    roiPercentage: 11.1,
    isBullish: true,
    realizedIsPositive: true,
  },
  holdings: [
    {
      id: AssetIdSchema.parse('asset-btc-test'),
      symbol: 'BTC',
      amount: 1.0,
      avgPriceEur: 50_000,
      currentValueEur: 62_000,
      costBasisEur: 50_000,
      unrealizedPnlEur: 12_000,
      pnlEur: 12_000,
      portfolioLocations: ['Kraken'],
    },
  ],
}

function createMockPort(overrides?: Partial<ICryptoPortfolioPort>): ICryptoPortfolioPort {
  return {
    getSummary: vi.fn().mockResolvedValue(mockSummary),
    getTokenDetails: vi.fn().mockResolvedValue(mockSummary.holdings[0]),
    getTokenHistory: vi.fn().mockResolvedValue({}),
    getIngestionStatus: vi.fn().mockResolvedValue({ status: 'idle', progress: 0, message: '', processedCount: 0, totalCount: 0 }),
    triggerRebuild: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Portfolio Data Composable (portfolio-data-composable)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function setupApp(portOverrides = {}) {
    const app = createApp({})
    app.use(createPinia())
    app.use(PiniaColada)
    const port = createMockPort(portOverrides)
    app.provide(PORTFOLIO_PORT_KEY, port)
    return { app, port }
  }

  it('Initializes Composable and fetches data automatically', async () => {
    const { app, port } = setupApp()

    let result: ReturnType<typeof usePortfolioData>
    app.runWithContext(() => {
      result = usePortfolioData()
    })

    // Initially loading because useQuery triggers immediately
    expect(result!.isFetching.value).toBe(true)
    expect(result!.metrics.value).toBeNull()

    // Wait for the query to resolve
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(port.getSummary).toHaveBeenCalled()
    expect(result!.isFetching.value).toBe(false)
    expect(result!.metrics.value).toEqual(mockSummary.metrics)
    expect(result!.filteredHoldings.value.length).toBe(1)
  })

  it('Triggering Rebuild triggers mutation and invalidates cache', async () => {
    const { app, port } = setupApp({
      triggerRebuild: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50))),
    })

    let composable: ReturnType<typeof usePortfolioData>
    app.runWithContext(() => {
      composable = usePortfolioData()
    })

    // Wait for initial fetch
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(port.getSummary).toHaveBeenCalledTimes(1)

    // Trigger rebuild
    let rebuildPromise: Promise<void>
    app.runWithContext(() => {
      rebuildPromise = composable!.handleRebuild()
    })

    await nextTick()
    expect(composable!.isRebuilding.value).toBe(true)

    // Wait for rebuild to finish
    await rebuildPromise!
    expect(composable!.isRebuilding.value).toBe(false)
    expect(port.triggerRebuild).toHaveBeenCalledTimes(1)
  })
})
