import type { ICryptoMetricsPort, CryptoKpis, TimeRange, PerformancePoint, PerformanceMetrics, AssetAllocationItem, HeatmapDay, VolatilityHeatmapEntity, HeatmapStats, RiskMetrics, DrawdownPoint } from '@/core/domain/ports/ICryptoMetricsPort'
import { CryptoKpisSchema, PerformanceHistoryResponseSchema, AssetAllocationResponseSchema, VolatilityHeatmapResponseSchema, DrawdownCurveResponseSchema } from '@/core/infrastructure/dtos/CryptoMetricsSchemas'
import { RiskMetricsSchema } from '@/core/infrastructure/dtos/RiskMetricsSchema'
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

const RANGE_DAYS_MAP: Record<TimeRange, string> = {
  '1D': '1',
  '1W': '7',
  '1M': '30',
  '1Y': '365',
  '5Y': '1825',
  'ALL': '3650',
}

export class RestCryptoMetricsAdapter implements ICryptoMetricsPort {
  async getKpis(): Promise<CryptoKpis> {
    const res = await bffClient.api.metrics.kpis.$get()
    const rawData = await res.json()
    return parseOrFail(CryptoKpisSchema, rawData, 'getKpis')
  }

  async getPerformanceHistory(range: TimeRange): Promise<{ history: PerformancePoint[]; metrics: PerformanceMetrics }> {
    const days = RANGE_DAYS_MAP[range] || '30'
    const res = await bffClient.api.metrics.performance.$get({ query: { days } })
    const rawData = await res.json()
    return parseOrFail(PerformanceHistoryResponseSchema, rawData, 'getPerformanceHistory')
  }

  async getAssetAllocation(): Promise<{ items: AssetAllocationItem[]; totalAssets: number; hhiScore: number }> {
    const res = await bffClient.api.metrics.allocation.$get()
    const rawData = await res.json()
    return parseOrFail(AssetAllocationResponseSchema, rawData, 'getAssetAllocation')
  }

  async getVolatilityHeatmap(year: number): Promise<VolatilityHeatmapEntity> {
    const res = await bffClient.api.metrics.heatmap.$get({ query: { year: year.toString() } })
    const rawData = await res.json()
    const days = parseOrFail(VolatilityHeatmapResponseSchema, rawData, 'getVolatilityHeatmap')
    
    return {
      grid: this.buildHeatmapGrid(days),
      stats: this.calculateHeatmapStats(days)
    }
  }

  private buildHeatmapGrid(data: HeatmapDay[]): (HeatmapDay | null)[][] {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return Array.from({ length: 7 }, () => Array(15).fill(null));
    }
  
    const sorted = [...data].sort(
      (a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime(),
    );
    
    const lastItem = sorted[sorted.length - 1];
    const lastDate = new Date(lastItem.dateStr);
  
    let dow = lastDate.getDay();
    if (dow === 0) dow = 7;
  
    const dateMap = new Map(sorted.map((d) => [d.dateStr, d]));
  
    const latestSunday = new Date(lastDate);
    latestSunday.setDate(latestSunday.getDate() + (7 - dow));
  
    const firstMonday = new Date(latestSunday);
    firstMonday.setDate(firstMonday.getDate() - 104);
  
    const grid: (HeatmapDay | null)[][] = Array.from({ length: 7 }, () => Array(15).fill(null));
  
    let current = new Date(firstMonday);
    for (let w = 0; w < 15; w++) {
      for (let d = 0; d < 7; d++) {
        const dStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        grid[d][w] = dateMap.get(dStr) || null;
        current.setDate(current.getDate() + 1);
      }
    }
    return grid;
  }
  
  private calculateHeatmapStats(data: HeatmapDay[]): HeatmapStats {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { best: 0, worst: 0, positiveDays: 0, totalDays: 0, avg: 0 };
    }
  
    const sorted = [...data].sort(
      (a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime(),
    );
    const last105 = sorted.slice(-105);
  
    let best = -Infinity;
    let worst = Infinity;
    let positive = 0;
    let sum = 0;
  
    last105.forEach((d) => {
      if (d.returnPercent > best) best = d.returnPercent;
      if (d.returnPercent < worst) worst = d.returnPercent;
      if (d.returnPercent >= 0) positive++;
      sum += d.returnPercent;
    });
  
    return {
      best: best === -Infinity ? 0 : best,
      worst: worst === Infinity ? 0 : worst,
      positiveDays: positive,
      totalDays: last105.length,
      avg: last105.length > 0 ? sum / last105.length : 0,
    };
  }

  async getRiskMetrics(): Promise<RiskMetrics> {
    const res = await bffClient.api.metrics.risk.$get()
    const rawData = await res.json()
    return parseOrFail(RiskMetricsSchema, rawData, 'getRiskMetrics')
  }

  async getDrawdownCurve(range: TimeRange): Promise<DrawdownPoint[]> {
    const days = RANGE_DAYS_MAP[range] || '30'
    const res = await bffClient.api.metrics.drawdown.$get({ query: { days } })
    const rawData = await res.json()
    return parseOrFail(DrawdownCurveResponseSchema, rawData, 'getDrawdownCurve')
  }
}

