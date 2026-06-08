/**
 * MockCryptoAdapter — Offline portfolio adapter for development and testing.
 *
 * Implements ICryptoPortfolioRepository using hardcoded domain entities.
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

import { bffClient } from '../http/BffClient'
import { MockPortfolioSummarySchema, MockTokenHistorySchema, MockIngestionStatusSchema } from '@/core/infrastructure/dtos/MockDtoSchemas'

export class MockCryptoAdapter implements ICryptoPortfolioRepository {
  async getSummary(): Promise<PortfolioSummaryEntity> {
    const res = await bffClient.api.portfolio.summary.$get()
    if (!res.ok) {
      throw new Error(`[MockCryptoAdapter] Error fetching summary: ${res.statusText}`)
    }
    
    const parsed = MockPortfolioSummarySchema.safeParse(await res.json())
    
    if (!parsed.success) {
      console.error('[MockCryptoAdapter] Validation failed:', parsed.error)
      throw new Error(`[MockCryptoAdapter] Data validation failed for summary: ${parsed.error.message}`)
    }
    
    const data = parsed.data
    
    return {
      metrics: {
        totalEquityEur: data.metrics.totalEquityEur,
        totalCostBasisEur: data.metrics.totalEquityEur - data.metrics.totalUnrealizedPnlEur, // approximated
        totalRealizedPnlEur: data.metrics.totalRealizedPnlEur,
        totalUnrealizedPnlEur: data.metrics.totalUnrealizedPnlEur,
        totalPnlEur: data.metrics.totalRealizedPnlEur + data.metrics.totalUnrealizedPnlEur,
      },
      holdings: data.holdings,
    }
  }

  async getTokenDetails(symbol: string): Promise<CryptoAssetEntity> {
    const summary = await this.getSummary()
    const holding = summary.holdings.find((h) => h.symbol === symbol)
    if (!holding) {
      throw new Error(`[MockCryptoAdapter] No mock data for symbol: ${symbol}`)
    }
    return holding
  }

  async getTokenHistory(symbol: string): Promise<TokenHistoryEntity> {
    const res = await bffClient.api.portfolio.token[':symbol'].history.$get({
      param: { symbol }
    })
    if (!res.ok) {
      throw new Error(`[MockCryptoAdapter] Error fetching history for ${symbol}: ${res.statusText}`)
    }
    const parsed = MockTokenHistorySchema.safeParse(await res.json())
    if (!parsed.success) {
      throw new Error(`[MockCryptoAdapter] Data validation failed for history: ${parsed.error.message}`)
    }
    return parsed.data
  }

  async getIngestionStatus(): Promise<IngestionStatusEntity> {
    const res = await bffClient.api.ingestion.status.$get()
    if (!res.ok) {
      throw new Error(`[MockCryptoAdapter] Error fetching ingestion status: ${res.statusText}`)
    }
    const parsed = MockIngestionStatusSchema.safeParse(await res.json())
    if (!parsed.success) {
      throw new Error(`[MockCryptoAdapter] Data validation failed for ingestion status: ${parsed.error.message}`)
    }
    return parsed.data
  }

  async triggerRebuild(): Promise<void> {
    // Simulate operation
  }
}
