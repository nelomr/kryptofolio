/**
 * The currency segment in a crypto-metrics query key is not decorative: it is what lets two
 * currencies' figures coexist in cache instead of colliding into one slot. Without it, switching
 * back to a previously-fetched currency renders the *other* currency's cached payload until a
 * refetch happens to land — a stale-currency figure shown as if it were current (design D10).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import { useCryptoKpisQuery } from "@/composables/queries/useCryptoMetricsQueries";
import { CRYPTO_METRICS_PORT_KEY, SETTINGS_PORT_KEY } from "@/core/injectionKeys";
import type { ICryptoMetricsPort, CryptoKpis } from "@/core/domain/ports/ICryptoMetricsPort";
import type { ISettingsPort } from "@/core/domain/ports/ISettingsPort";

function kpisIn(currency: string): CryptoKpis {
  return {
    totalEquityFiat: currency === "USD" ? 1000 : 920,
    totalCostBasisFiat: 800,
    totalUnrealizedPnlFiat: 200,
    totalRealizedPnlFiat: 0,
    allTimeHighFiat: 1000,
    maxDrawdownPercent: 0,
    annualizedVolatilityPercent: 0,
    sharpeRatio: 0,
    currency,
  };
}

describe("crypto-metrics query keys segment by currency (task 11.6)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps USD and EUR KPI payloads in separate cache entries", async () => {
    const getKpis = vi.fn(async (currency?: string) => kpisIn(currency ?? "USD"));
    const metricsPort = { getKpis } as unknown as ICryptoMetricsPort;

    let served = "USD";
    const settingsPort = {
      getBaseCurrency: vi.fn(async () => served),
    } as unknown as ISettingsPort;

    let kpis!: ReturnType<typeof useCryptoKpisQuery>;
    let cache!: ReturnType<typeof useQueryCache>;

    const app = createApp({
      setup() {
        kpis = useCryptoKpisQuery();
        cache = useQueryCache();
        return () => h("div", String(kpis.data.value?.totalEquityFiat ?? ""));
      },
    });
    app.use(createPinia());
    app.use(PiniaColada);
    app.provide(CRYPTO_METRICS_PORT_KEY, metricsPort);
    app.provide(SETTINGS_PORT_KEY, settingsPort);

    const host = document.createElement("div");
    document.body.appendChild(host);
    app.mount(host);

    await new Promise((r) => setTimeout(r, 20));
    expect(kpis.data.value?.currency).toBe("USD");
    expect(kpis.data.value?.totalEquityFiat).toBe(1000);
    expect(getKpis).toHaveBeenCalledTimes(1);

    // Switch to EUR: invalidate the base-currency query so the reactive `currency` in the
    // metrics composable picks up the new value, exactly as the real currency-settings mutation does.
    served = "EUR";
    await cache.invalidateQueries({ key: ["settings", "base_currency"] });
    await nextTick();
    await new Promise((r) => setTimeout(r, 20));

    expect(kpis.data.value?.currency).toBe("EUR");
    expect(kpis.data.value?.totalEquityFiat).toBe(920);
    expect(getKpis).toHaveBeenCalledTimes(2);

    // Switch back to USD: this must be a cache hit on the USD entry, not a collision with EUR's.
    served = "USD";
    await cache.invalidateQueries({ key: ["settings", "base_currency"] });
    await nextTick();
    await new Promise((r) => setTimeout(r, 20));

    expect(kpis.data.value?.currency).toBe("USD");
    expect(kpis.data.value?.totalEquityFiat).toBe(1000);
  });
});
