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
  TokenHistoryEntity,
} from '@/core/domain/models/PortfolioEntities'
import { AssetIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Static mock domain data — already clean domain entities (no Zod parsing needed)
// ---------------------------------------------------------------------------

const MOCK_HOLDINGS: CryptoAssetEntity[] = [
  {
    id: AssetIdSchema.parse('asset-btc-mock'),
    symbol: 'BTC',
    amount: 1.02,
    avgPriceEur: 30_198,
    currentValueEur: 92_462.14,
    costBasisEur: 30_802.20,
    unrealizedPnlEur: 61_659.94,
    pnlEur: 61_659.94,
    portfolioLocations: ['Kraken', 'Tangem'],
  },
  {
    id: AssetIdSchema.parse('asset-eth-mock'),
    symbol: 'ETH',
    amount: 6.4,
    avgPriceEur: 2_500,
    currentValueEur: 19_200,
    costBasisEur: 16_000,
    unrealizedPnlEur: 3_200,
    pnlEur: 3_200,
    portfolioLocations: ['Bitvavo', 'Bit2Me'],
  },
  {
    id: AssetIdSchema.parse('asset-sol-mock'),
    symbol: 'SOL',
    amount: 175.99,
    avgPriceEur: 50,
    currentValueEur: 26_398.5,
    costBasisEur: 8_799.5,
    unrealizedPnlEur: 17_599,
    pnlEur: 17_599,
    portfolioLocations: ['Phantom', 'Kraken'],
  },
  {
    id: AssetIdSchema.parse('asset-ada-mock'),
    symbol: 'ADA',
    amount: 3543.34,
    avgPriceEur: 0.35,
    currentValueEur: 1_240.16,
    costBasisEur: 1_240.16,
    unrealizedPnlEur: 0,
    pnlEur: 0,
    portfolioLocations: ['BitUnix', 'Bitvavo'],
  },
  {
    id: AssetIdSchema.parse('asset-hbar-mock'),
    symbol: 'HBAR',
    amount: 20239,
    avgPriceEur: 0.05,
    currentValueEur: 1_011.95,
    costBasisEur: 1_011.95,
    unrealizedPnlEur: 0,
    pnlEur: 0,
    portfolioLocations: ['Kraken', 'Bitvavo'],
  },
  {
    id: AssetIdSchema.parse('asset-xrp-mock'),
    symbol: 'XRP',
    amount: 361.45,
    avgPriceEur: 0.55,
    currentValueEur: 198.79,
    costBasisEur: 198.79,
    unrealizedPnlEur: 0,
    pnlEur: 0,
    portfolioLocations: ['Kraken', 'Tangem'],
  },
  {
    id: AssetIdSchema.parse('asset-uni-mock'),
    symbol: 'UNI',
    amount: 400,
    avgPriceEur: 0,
    currentValueEur: 2_000,
    costBasisEur: 0,
    unrealizedPnlEur: 2_000,
    pnlEur: 2_000,
    portfolioLocations: ['Uniswap'],
  },
  {
    id: AssetIdSchema.parse('asset-b2m-mock'),
    symbol: 'B2M',
    amount: 75.5,
    avgPriceEur: 0,
    currentValueEur: 1.51,
    costBasisEur: 0,
    unrealizedPnlEur: 1.51,
    pnlEur: 1.51,
    portfolioLocations: ['Bit2Me'],
  },
  {
    id: AssetIdSchema.parse('asset-pump-mock'),
    symbol: 'PUMP',
    amount: 7704,
    avgPriceEur: 0.006,
    currentValueEur: 46.22,
    costBasisEur: 46.22,
    unrealizedPnlEur: 0,
    pnlEur: 0,
    portfolioLocations: ['Kraken'],
  },
  {
    id: AssetIdSchema.parse('asset-ena-mock'),
    symbol: 'ENA',
    amount: 42.36,
    avgPriceEur: 0.5,
    currentValueEur: 21.18,
    costBasisEur: 21.18,
    unrealizedPnlEur: 0,
    pnlEur: 0,
    portfolioLocations: ['Kraken'],
  }
]

const MOCK_SUMMARY: PortfolioSummaryEntity = {
  metrics: {
    totalEquityEur: 142_580.45,
    totalCostBasisEur: 58_120.00,
    totalRealizedPnlEur: 12_234.50,
    totalUnrealizedPnlEur: 72_225.95,
    totalPnlEur: 84_460.45,
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

  async getTokenHistory(symbol: string): Promise<TokenHistoryEntity> {
    await delay(250)
    // Return the rich 3-level mock data mapped to domain entities
    const mockPortfolio = (await import('@/data/mockPortfolio')).default
    const rawLots = mockPortfolio.lots[symbol as keyof typeof mockPortfolio.lots] || []
    const rawHistory = mockPortfolio.history[symbol as keyof typeof mockPortfolio.history] || {}

    // Map snake_case mock data to domain entities (TaxLotEntity uses camelCase + Date)
    const lots = rawLots.map((lot) => ({
      id: lot.id as import('@/core/domain/models/BrandedTypes').LotId,
      symbol: lot.symbol,
      date: new Date(lot.date * 1000),
      exchange: lot.exchange,
      originalQty: lot.original_qty,
      remainingQty: lot.remaining_qty,
      unitCost: lot.unit_cost,
      totalCost: lot.total_cost,
    }))

    // Map lot history: each lot's events to TaxLotHistoryEvent[]
    const history: Record<string, import('@/core/domain/models/FiscalEntities').TaxLotHistoryEvent[]> = {}
    for (const [lotId, lotRecord] of Object.entries(rawHistory)) {
      history[lotId] = (lotRecord as { history: Array<{
        id: string;
        disposal_date: number;
        amount_from_lot: number;
        sale_price_eur: number;
        gain_loss_eur: number;
        is_taxable: boolean;
        flag?: 'WALLET_ACTIVATION' | null;
        notes?: string;
      }> }).history.map((ev) => ({
        id: ev.id,
        disposalDate: new Date(ev.disposal_date * 1000),
        amountFromLot: ev.amount_from_lot,
        salePriceEur: ev.sale_price_eur,
        gainLossEur: ev.gain_loss_eur,
        isTaxable: ev.is_taxable,
        flag: ev.flag ?? null,
        notes: ev.notes,
      }))
    }

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
