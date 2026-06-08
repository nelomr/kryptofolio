import type { ICryptoMetricsRepository, CryptoKpis, TimeRange, PerformancePoint, PerformanceMetrics } from '@/core/domain/ports/ICryptoMetricsRepository'
import { CryptoKpisSchema, PerformanceHistoryResponseSchema } from '@/core/infrastructure/dtos/CryptoMetricsSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'
import { bffClient } from '../http/BffClient'

export class DomainValidationError extends Error {
  public readonly zodErrors: unknown

  constructor(context: string, zodErrors: unknown) {
    super(`[RestCryptoMetricsAdapter] Validation failed in ${context}`)
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

export class RestCryptoMetricsAdapter implements ICryptoMetricsRepository {
  async getKpis(): Promise<CryptoKpis> {
    const res = await bffClient.api.metrics.kpis.$get()
    const rawData = await res.json()
    return parseOrFail(CryptoKpisSchema, rawData, 'getKpis')
  }

  async getPerformanceHistory(range: TimeRange): Promise<{ history: PerformancePoint[]; metrics: PerformanceMetrics }> {
    const res = await bffClient.api.metrics.performance.$get({ query: { days: range === '1M' ? '30' : '365' } })
    const rawData = await res.json()
    return parseOrFail(PerformanceHistoryResponseSchema, rawData, 'getPerformanceHistory')
  }
}
