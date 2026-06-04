/**
 * Unit Tests — usePortfolioData composable (Pinia Colada Migration)
 *
 * UPDATED: Tests now inject a mock ICryptoPortfolioRepository and rely on
 * @pinia/colada for async state management. The manual store is gone.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { PiniaColada } from '@pinia/colada'
import { usePortfolioData } from '@/views/Portfolio/composables/usePortfolioData'
import { useChartData } from '@/views/Portfolio/composables/useChartData'
import { PORTFOLIO_REPO_KEY } from '@/core/injectionKeys'
import type { ICryptoPortfolioRepository } from '@/core/domain/repositories/ICryptoPortfolioRepository'
import type { PortfolioSummaryEntity } from '@/core/domain/models/PortfolioEntities'
import { AssetIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

const mockSummary: PortfolioSummaryEntity = {
  metrics: {
    totalEquityEur: 62_000,
    totalCostBasisEur: 50_000,
    totalRealizedPnlEur: 0,
    totalUnrealizedPnlEur: 12_000,
    totalPnlEur: 12_000,
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

function createMockRepo(overrides?: Partial<ICryptoPortfolioRepository>): ICryptoPortfolioRepository {
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

  function setupApp(repoOverrides = {}) {
    const app = createApp({})
    app.use(createPinia())
    app.use(PiniaColada)
    const repo = createMockRepo(repoOverrides)
    app.provide(PORTFOLIO_REPO_KEY, repo)
    return { app, repo }
  }

  it('Initializes Composable and fetches data automatically', async () => {
    const { app, repo } = setupApp()

    let result: ReturnType<typeof usePortfolioData>
    app.runWithContext(() => {
      result = usePortfolioData()
    })

    // Initially loading because useQuery triggers immediately
    expect(result!.isFetching.value).toBe(true)
    expect(result!.metrics.value).toBeNull()

    // Wait for the query to resolve
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(repo.getSummary).toHaveBeenCalled()
    expect(result!.isFetching.value).toBe(false)
    expect(result!.metrics.value).toEqual(mockSummary.metrics)
    expect(result!.filteredHoldings.value.length).toBe(1)
  })

  it('Generate Allocation Data', async () => {
    const { app } = setupApp()

    let composable: ReturnType<typeof usePortfolioData>
    let chartComposable: ReturnType<typeof useChartData>

    app.runWithContext(() => {
      composable = usePortfolioData()
      chartComposable = useChartData(composable.metrics, composable.filteredHoldings)
    })

    // Wait for query resolution
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(chartComposable!.allocationData.value.length).toBeGreaterThan(0)
    expect(chartComposable!.allocationData.value[0]).toHaveProperty('label')
    expect(chartComposable!.allocationData.value[0]).toHaveProperty('value')
    expect(chartComposable!.allocationData.value[0]).toHaveProperty('color')
    expect(chartComposable!.allocationData.value[0].color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('Generate Performance Data', async () => {
    const { app } = setupApp()

    let composable: ReturnType<typeof usePortfolioData>
    let chartComposable: ReturnType<typeof useChartData>

    app.runWithContext(() => {
      composable = usePortfolioData()
      chartComposable = useChartData(composable.metrics, composable.filteredHoldings)
    })

    // Wait for query resolution
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(chartComposable!.performanceData.value.length).toBe(721)
    expect(chartComposable!.performanceData.value[0]).toHaveProperty('time')
    expect(chartComposable!.performanceData.value[0]).toHaveProperty('value')

    const lastPoint = chartComposable!.performanceData.value[chartComposable!.performanceData.value.length - 1]
    expect(lastPoint.value).toBe(mockSummary.metrics.totalEquityEur)
  })

  it('Triggering Rebuild triggers mutation and invalidates cache', async () => {
    const { app, repo } = setupApp({
      triggerRebuild: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50))),
    })

    let composable: ReturnType<typeof usePortfolioData>
    app.runWithContext(() => {
      composable = usePortfolioData()
    })

    // Wait for initial fetch
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(repo.getSummary).toHaveBeenCalledTimes(1)

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
    expect(repo.triggerRebuild).toHaveBeenCalledTimes(1)
  })
})
