import type { CryptoKpis, ICryptoMetricsRepository, TimeRange, PerformancePoint, PerformanceMetrics } from '@/core/domain/ports/ICryptoMetricsRepository'
import { bffClient } from '../http/BffClient'

export class MockCryptoMetricsAdapter implements ICryptoMetricsRepository {
  async getKpis(): Promise<CryptoKpis> {
    try {
      const res = await bffClient.api.metrics.kpis.$get()
      if (!res.ok) throw new Error('Failed to fetch KPIs from BFF')
      return await res.json() as CryptoKpis
    } catch (error) {
      console.error('KPI Fetch Error:', error)
      throw error
    }
  }

  async getPerformanceHistory(range: TimeRange): Promise<{
    history: PerformancePoint[];
    metrics: PerformanceMetrics;
  }> {
    try {
      let days = 30
      switch(range) {
        case '1D': days = 1; break;
        case '1W': days = 7; break;
        case '1M': days = 30; break;
        case '1Y': days = 365; break;
        case 'ALL': days = 730; break;
      }
      const res = await bffClient.api.metrics.performance.$get({ query: { days: days.toString() } })
      if (!res.ok) throw new Error('Failed to fetch performance from BFF')
      return await res.json() as { history: PerformancePoint[], metrics: PerformanceMetrics }
    } catch (error) {
      console.error('Performance Fetch Error:', error)
      throw error
    }
  }
}
