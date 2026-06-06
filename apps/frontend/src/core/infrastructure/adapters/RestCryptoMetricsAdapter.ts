import type { ICryptoMetricsRepository, CryptoKpis, TimeRange, PerformancePoint, PerformanceMetrics } from '@/core/domain/ports/ICryptoMetricsRepository'
import type { IHttpClient } from '@/core/domain/ports/IHttpClient'
import { CryptoKpisSchema, PerformanceHistoryResponseSchema } from '@/core/infrastructure/dtos/CryptoMetricsSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

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
  private readonly http: IHttpClient

  constructor(http: IHttpClient) {
    this.http = http
  }

  async getKpis(): Promise<CryptoKpis> {
    const response = await this.http.get<unknown>('/api/portfolio/kpis')
    return parseOrFail(CryptoKpisSchema, response.data, 'getKpis')
  }

  async getPerformanceHistory(range: TimeRange): Promise<{ history: PerformancePoint[]; metrics: PerformanceMetrics }> {
    const response = await this.http.get<unknown>(`/api/portfolio/performance?range=${range}`)
    return parseOrFail(PerformanceHistoryResponseSchema, response.data, 'getPerformanceHistory')
  }
}
