/**
 * MockCryptoAdapter — Offline portfolio adapter for development and testing.
 *
 * Implements ICryptoPortfolioRepository using hardcoded domain entities.
 * Simulates realistic network latency to test loading states in the UI.
 * Switch to this adapter by setting VITE_USE_MOCK=true.
 *
 * @see openspec/specs/mock-adapters/spec.md
 */

import type { ICryptoPortfolioRepository } from '@/core/domain/repositories/ICryptoPortfolioRepository'
import type {
  PortfolioSummaryEntity,
  CryptoAssetEntity,
  IngestionStatusEntity,
} from '@/core/domain/models/PortfolioEntities'
import { AssetIdSchema } from '@/core/domain/models/BrandedTypes'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Static mock domain data — already clean domain entities (no Zod parsing needed)
// ---------------------------------------------------------------------------

const MOCK_HOLDINGS: CryptoAssetEntity[] = [
  {
    id: AssetIdSchema.parse('asset-btc-mock'),
    symbol: 'BTC',
    amount: 0.5432,
    avgPriceEur: 35_000,
    currentValueEur: 31_505.60,
    costBasisEur: 19_012,
    unrealizedPnlEur: 12_493.60,
    pnlEur: 12_493.60,
    portfolioLocations: ['Ledger', 'Kraken', 'Bit2Me'],
  },
  {
    id: AssetIdSchema.parse('asset-eth-mock'),
    symbol: 'ETH',
    amount: 4.5,
    avgPriceEur: 1_800,
    currentValueEur: 10_350,
    costBasisEur: 8_100,
    unrealizedPnlEur: 2_250,
    pnlEur: 2_250,
    portfolioLocations: ['Metamask', 'Binance'],
  },
  {
    id: AssetIdSchema.parse('asset-sol-mock'),
    symbol: 'SOL',
    amount: 50,
    avgPriceEur: 120,
    currentValueEur: 7_500,
    costBasisEur: 6_000,
    unrealizedPnlEur: 1_500,
    pnlEur: 1_500,
    portfolioLocations: ['Phantom'],
  },
]

const MOCK_SUMMARY: PortfolioSummaryEntity = {
  metrics: {
    totalEquityEur: 49_355.60,
    totalCostBasisEur: 33_112,
    totalRealizedPnlEur: 12_234.50,
    totalUnrealizedPnlEur: 16_243.60,
    totalPnlEur: 28_478.10,
  },
  holdings: MOCK_HOLDINGS,
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class MockCryptoAdapter implements ICryptoPortfolioRepository {
  async getSummary(): Promise<PortfolioSummaryEntity> {
    await delay(400) // Simulate network latency
    return MOCK_SUMMARY
  }

  async getTokenDetails(symbol: string): Promise<CryptoAssetEntity> {
    await delay(250)
    const holding = MOCK_HOLDINGS.find((h) => h.symbol === symbol)
    if (!holding) {
      throw new Error(`[MockCryptoAdapter] No mock data for symbol: ${symbol}`)
    }
    return holding
  }

  async getTokenHistory(symbol: string): Promise<Record<string, any>> {
    await delay(250)
    // Return the rich 3-level mock data
    const mockPortfolio = (await import('@/data/mockPortfolio')).default
    const lots = mockPortfolio.lots[symbol as keyof typeof mockPortfolio.lots] || []
    const history = mockPortfolio.history[symbol as keyof typeof mockPortfolio.history] || {}
    
    return { lots, history }
  }

  async getIngestionStatus(): Promise<IngestionStatusEntity> {
    await delay(100)
    return {
      status: 'idle',
      progress: 0,
      message: '',
      processedCount: 0,
      totalCount: 0,
    }
  }

  async triggerRebuild(): Promise<void> {
    await delay(1500) // Simulate a long operation
  }
}
