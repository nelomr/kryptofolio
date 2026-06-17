import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createApp, ref } from "vue";
import { PiniaColada } from "@pinia/colada";
import { useDrawdownCurveQuery } from "@/composables/queries/useCryptoMetricsQueries";
import { CRYPTO_METRICS_PORT_KEY } from "@/core/injectionKeys";
import type { ICryptoMetricsPort, TimeRange } from "@/core/domain/ports/ICryptoMetricsPort";

const mockDrawdown = [
  { timestamp: 1672531200, drawdownPercent: -1.23 }
];

function createMockPort(): Partial<ICryptoMetricsPort> {
  return {
    getDrawdownCurve: vi.fn().mockResolvedValue(mockDrawdown)
  };
}

describe("useDrawdownCurveQuery Composable", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function setupApp() {
    const app = createApp({});
    app.use(createPinia());
    app.use(PiniaColada);
    const port = createMockPort() as ICryptoMetricsPort;
    app.provide(CRYPTO_METRICS_PORT_KEY, port);
    return { app, port };
  }

  it("fetches drawdown curve data and returns reactive state", async () => {
    const { app, port } = setupApp();
    const range = ref<TimeRange>("1M");

    let composable: ReturnType<typeof useDrawdownCurveQuery>;
    app.runWithContext(() => {
      composable = useDrawdownCurveQuery(range);
    });

    expect(composable!.isLoading.value).toBe(true);

    // wait for query resolution
    await new Promise((r) => setTimeout(r, 10));

    expect(port.getDrawdownCurve).toHaveBeenCalledWith("1M");
    expect(composable!.isLoading.value).toBe(false);
    expect(composable!.data.value).toEqual(mockDrawdown);
  });
});
