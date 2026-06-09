/**
 * RestCryptoAdapter — Production HTTP adapter for portfolio data.
 *
 * Implements ICryptoPortfolioPort using Hono RPC (hc).
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 * @see openspec/specs/global-error-handling/spec.md
 */


import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
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
import { bffClient } from '../http/BffClient'

export class DomainValidationError extends Error {
  public readonly zodErrors: unknown

  constructor(context: string, zodErrors: unknown) {
    super(`[RestCryptoAdapter] Validation failed in ${context}`)
    this.name = 'DomainValidationError'
    this.zodErrors = zodErrors
  }
}

function parseOrFail<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } },
  rawData: unknown,
  context: string,
): T {
  const result = schema.safeParse(rawData)
  if (!result.success) {
    errorBus.emit('validation-error', { 
      message: 'errors.validation.api_malformed_data',
      context: context, 
      details: result.error 
    })
    throw new DomainValidationError(context, result.error)
  }
  return result.data!
}

export class RestCryptoAdapter implements ICryptoPortfolioPort {
  async getSummary(): Promise<PortfolioSummaryEntity> {
    const res = await bffClient.api.portfolio.summary.$get()
    const rawData = await res.json()
    const dto = parseOrFail(ExternalPortfolioSummarySchema, rawData, 'getSummary')

    const pnlValue = dto.metrics.totalUnrealizedPnlEur ?? 0
    const realizedPnlValue = dto.metrics.totalRealizedPnlEur ?? 0
    
    let roiPercentage = 0
    if (dto.metrics.totalEquityEur > 0) {
      const costBasis = dto.metrics.totalEquityEur - pnlValue
      if (costBasis > 0) {
        roiPercentage = (pnlValue / costBasis) * 100
      }
    }

    return {
      metrics: {
        ...dto.metrics,
        roiPercentage,
        isBullish: pnlValue >= 0,
        realizedIsPositive: realizedPnlValue >= 0
      },
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
    const res = await bffClient.api.portfolio.token[':symbol'].$get({ param: { symbol } })
    const rawData = await res.json()
    const dto = parseOrFail(ExternalAssetSchema, rawData, `getTokenDetails(${symbol})`)

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
    const res = await bffClient.api.portfolio.token[':symbol'].history.$get({ param: { symbol } })
    const rawData = await res.json()
    return parseOrFail(ExternalTokenHistorySchema, rawData, 'getTokenHistory')
  }

  async getIngestionStatus(): Promise<IngestionStatusEntity> {
    const res = await bffClient.api.ingestion.status.$get()
    const rawData = await res.json()
    return parseOrFail(ExternalIngestionStatusSchema, rawData, 'getIngestionStatus')
  }

  async triggerRebuild(): Promise<void> {
    await bffClient.api.portfolio.rebuild.$post()
  }
}
