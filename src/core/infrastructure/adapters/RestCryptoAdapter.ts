/**
 * RestCryptoAdapter — Production HTTP adapter for portfolio data.
 *
 * Implements ICryptoPortfolioRepository using a real HTTP client (IHttpClient).
 * All incoming API responses are parsed through Zod schemas before entering
 * the domain. If safeParse fails, the error is emitted to the global errorBus
 * and a DomainValidationError is thrown (caught by the Pinia store).
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 * @see openspec/specs/global-error-handling/spec.md
 */

import type { ICryptoPortfolioRepository } from '@/core/domain/repositories/ICryptoPortfolioRepository'
import type { IHttpClient } from '@/core/domain/ports/IHttpClient'
import type {
  PortfolioSummaryEntity,
  CryptoAssetEntity,
  IngestionStatusEntity,
  TokenHistoryEntity,
} from '@/core/domain/models/PortfolioEntities'
import {
  ExternalPortfolioSummarySchema,
  ExternalIngestionStatusSchema,
  ExternalAssetSchema,
} from '@/core/infrastructure/dtos/ExternalPortfolioSchemas'
import { ExternalTokenHistorySchema } from '@/core/infrastructure/dtos/ExternalTaxSchemas'
import { AssetIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

// ---------------------------------------------------------------------------
// Domain error for controlled upstream catching
// ---------------------------------------------------------------------------

export class DomainValidationError extends Error {
  public readonly zodErrors: unknown

  constructor(context: string, zodErrors: unknown) {
    super(`[RestCryptoAdapter] Validation failed in ${context}`)
    this.name = 'DomainValidationError'
    this.zodErrors = zodErrors
  }
}

// ---------------------------------------------------------------------------
// Helper — parse with safeParse, emit to bus on failure, throw controlled error
// ---------------------------------------------------------------------------

function parseOrFail<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } },
  rawData: unknown,
  context: string,
): T {
  const result = schema.safeParse(rawData)
  if (!result.success) {
    const message = `API returned malformed data in ${context}. The UI may show stale data.`
    console.error(`[RestCryptoAdapter] ${message}`, result.error)
    errorBus.emit('validation-error', { message, context, details: result.error })
    throw new DomainValidationError(context, result.error)
  }
  return result.data!
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RestCryptoAdapter implements ICryptoPortfolioRepository {
  private readonly http: IHttpClient

  constructor(http: IHttpClient) {
    this.http = http
  }

  async getSummary(): Promise<PortfolioSummaryEntity> {
    const response = await this.http.get<unknown>('/api/portfolio/summary')
    const dto = parseOrFail(ExternalPortfolioSummarySchema, response.data, 'getSummary')

    return {
      metrics: dto.metrics,
      holdings: dto.holdings.map((h) => ({
        id: AssetIdSchema.parse(h.id),
        symbol: h.symbol,
        amount: h.amount,
        avgPriceEur: h.avgPriceEur,
        currentValueEur: h.currentValueEur,
        costBasisEur: h.costBasisEur,
        unrealizedPnlEur: h.unrealizedPnlEur,
        pnlEur: h.pnlEur,
        portfolioLocations: h.portfolioLocations,
      })),
    }
  }

  async getTokenDetails(symbol: string): Promise<CryptoAssetEntity> {
    const response = await this.http.get<unknown>(`/api/portfolio/token/${symbol}`)
    const dto = parseOrFail(ExternalAssetSchema, response.data, `getTokenDetails(${symbol})`)

    return {
      id: AssetIdSchema.parse(dto.id),
      symbol: dto.symbol,
      amount: dto.amount,
      avgPriceEur: dto.avgPriceEur,
      currentValueEur: dto.currentValueEur,
      costBasisEur: dto.costBasisEur,
      unrealizedPnlEur: dto.unrealizedPnlEur,
      pnlEur: dto.pnlEur,
      portfolioLocations: dto.portfolioLocations,
    }
  }

  async getTokenHistory(symbol: string): Promise<TokenHistoryEntity> {
    const response = await this.http.get<unknown>(
      `/api/portfolio/token/${symbol}/history`,
    )
    return parseOrFail(ExternalTokenHistorySchema, response.data, 'getTokenHistory')
  }

  async getIngestionStatus(): Promise<IngestionStatusEntity> {
    const response = await this.http.get<unknown>('/api/ingestion/status')
    return parseOrFail(ExternalIngestionStatusSchema, response.data, 'getIngestionStatus')
  }

  async triggerRebuild(): Promise<void> {
    await this.http.post('/api/portfolio/rebuild')
  }
}
