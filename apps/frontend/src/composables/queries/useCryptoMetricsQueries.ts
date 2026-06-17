import { inject } from "vue";
import { useQuery } from "@pinia/colada";
import { CRYPTO_METRICS_PORT_KEY } from "@/core/injectionKeys";
import type {
  ICryptoMetricsPort,
  TimeRange,
} from "@/core/domain/ports/ICryptoMetricsPort";
import type { Ref } from "vue";

export function useCryptoMetricsPort(): ICryptoMetricsPort {
  const port = inject(CRYPTO_METRICS_PORT_KEY);
  if (!port) {
    throw new Error(
      "[useCryptoMetricsPort] ICryptoMetricsPort not provided. " +
        "Ensure main.ts calls pinia.use() to inject ports.",
    );
  }
  return port;
}

export function useCryptoKpisQuery() {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: ["crypto-metrics-kpis"],
    query: () => port.getKpis(),
  });
}

export function usePerformanceHistoryQuery(range: Ref<TimeRange>) {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: () => ["crypto-performance-history", range.value],
    query: () => port.getPerformanceHistory(range.value),
  });
}

export function useAssetAllocationQuery() {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: ["crypto-asset-allocation"],
    query: () => port.getAssetAllocation(),
  });
}

export function useVolatilityHeatmapQuery(year: Ref<number>) {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: () => ["crypto-volatility-heatmap", year.value],
    query: () => port.getVolatilityHeatmap(year.value),
  });
}

export function useRiskMetricsQuery() {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: ["crypto-risk-metrics"],
    query: () => port.getRiskMetrics(),
  });
}

export function useDrawdownCurveQuery(range: Ref<TimeRange>) {
  const port = useCryptoMetricsPort();

  return useQuery({
    key: () => ["crypto-drawdown-curve", range.value],
    query: () => port.getDrawdownCurve(range.value),
  });
}

