import { inject, computed } from "vue";
import { useQuery } from "@pinia/colada";
import { CRYPTO_METRICS_PORT_KEY } from "@/core/injectionKeys";
import type {
  ICryptoMetricsPort,
  TimeRange,
} from "@/core/domain/ports/ICryptoMetricsPort";
import type { Ref } from "vue";
import { useBaseCurrencyQuery } from "./useSettingsQueries";

/**
 * Explicit, not Pinia Colada's 5s default: the dashboard fans out nine of these requests at
 * once, and a short default silently re-fires all nine on every navigation. Freshness comes
 * from explicit invalidation on ledger-dirtying mutations (see useSettingsMutations.ts /
 * useTaxMutations.ts), not from a timer (design D10).
 */
const METRICS_STALE_TIME_MS = 60 * 1000;

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

/**
 * The display currency every metrics query below binds into both its request and its key.
 * Omitting it from the key was a real cache defect: two currencies could not coexist, and
 * switching back to one already fetched paid a full refetch instead of an instant cache hit
 * (design D10).
 */
function useDisplayCurrency() {
  const { data } = useBaseCurrencyQuery();
  return computed(() => data.value ?? "USD");
}

export function useCryptoKpisQuery() {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-metrics-kpis", currency.value],
    query: () => port.getKpis(currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}

export function usePerformanceHistoryQuery(range: Ref<TimeRange>) {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-performance-history", range.value, currency.value],
    query: () => port.getPerformanceHistory(range.value, currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}

export function useAssetAllocationQuery() {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-asset-allocation", currency.value],
    query: () => port.getAssetAllocation(currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}

export function useVolatilityHeatmapQuery(year: Ref<number>) {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-volatility-heatmap", year.value, currency.value],
    query: () => port.getVolatilityHeatmap(year.value, currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}

export function useRiskMetricsQuery() {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-risk-metrics", currency.value],
    query: () => port.getRiskMetrics(currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}

export function useDrawdownCurveQuery(range: Ref<TimeRange>) {
  const port = useCryptoMetricsPort();
  const currency = useDisplayCurrency();

  return useQuery({
    key: () => ["crypto-drawdown-curve", range.value, currency.value],
    query: () => port.getDrawdownCurve(range.value, currency.value),
    staleTime: METRICS_STALE_TIME_MS,
  });
}
