import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { ref, computed } from "vue";
import PortfolioView from "@/views/Portfolio/PortfolioView.vue";
import * as portfolioData from "@/views/Portfolio/composables/usePortfolioData";

// ── Lucide stubs ──────────────────────────────────────────────────────────────
vi.mock("lucide-vue-next", () => ({
  RefreshCw: { template: '<svg class="lucide-refresh"></svg>' },
  TrendingUp: { template: '<svg class="lucide-trending-up"></svg>' },
  TrendingDown: { template: '<svg class="lucide-trending-down"></svg>' },
  Wallet: { template: '<svg class="lucide-wallet"></svg>' },
}));

// ── Colada stubs ──────────────────────────────────────────────────────────────
vi.mock("@pinia/colada", () => ({
  useQuery: vi.fn().mockReturnValue({
    data: ref({
      totalRoiPercent: 0,
      totalRoiFiat: 0,
      delta24hFiat: 0,
      investedFiat: 0,
      maxDrawdownPercent: 0,
      maxDrawdownFiat: 0,
      recoveredFiat: 0,
      winRatePercent: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalTrades: 0,
      averageR: 0,
      portfolioDispersion: 0,
      bestAsset: {
        symbol: "BTC",
        name: "Bitcoin",
        allocationPercent: 50,
        roiPercent: 10,
      },
      worstAsset: {
        symbol: "XRP",
        name: "Ripple",
        allocationPercent: 10,
        roiPercent: -5,
      },
      // Asset Allocation Query requirements
      items: [
        {
          symbol: "BTC",
          name: "Bitcoin",
          allocationPercent: 100,
          valueFiat: 1000,
          colorHex: "#F7931A",
        },
      ],
      totalAssets: "1 Activo",
      hhiScore: 10000,
      // Volatility Heatmap Query requirements
      grid: Array.from({ length: 7 }, () => Array(15).fill(null)),
      stats: { best: 0, worst: 0, positiveDays: 0, totalDays: 0, avg: 0 },
      // Risk Metrics Query requirements
      sharpeRatio: 2.18,
      sortinoRatio: 2.62,
      calmarRatio: 3.41,
      betaVsBtc: 0.87,
      alphaPercent: 4.2,
      history: [1.5, 1.8, 2.0, 2.18],
    }),
    isLoading: ref(false),
    error: ref(null),
  }),
}));

// ── Chart stubs ───────────────────────────────────────────────────────────────

vi.mock("@/components/ui/tabs", () => ({
  Tabs: { template: "<div><slot /></div>" },
  TabsList: { template: "<div><slot /></div>" },
  TabsTrigger: { template: "<button><slot /></button>" },
  TabsContent: { template: "<div><slot /></div>" },
}));

vi.mock("vue-chartjs", () => ({
  Line: { template: '<div class="mock-line-chart"></div>' },
  Doughnut: { template: '<div class="mock-doughnut-chart"></div>' },
}));

vi.mock("@/views/Portfolio/components/metrics/DrawdownCurve.vue", () => ({
  default: {
    name: "DrawdownCurve",
    template: '<div class="mock-drawdown-curve"></div>',
  },
}));

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "Solid" },
  LineStyle: { Dashed: 1, Solid: 0 },
  AreaSeries: {},
  LineSeries: {},
  BaselineSeries: {},
  HistogramSeries: {},
  CrosshairMode: { Normal: 0, Magnet: 1 },
  PriceScaleMode: { Normal: 0 },
  createChart: vi.fn().mockReturnValue({
    addSeries: vi.fn().mockReturnValue({
      setData: vi.fn(),
      applyOptions: vi.fn(),
    }),
    addHistogramSeries: vi.fn().mockReturnValue({
      setData: vi.fn(),
      applyOptions: vi.fn(),
    }),
    addLineSeries: vi.fn().mockReturnValue({
      setData: vi.fn(),
      applyOptions: vi.fn(),
    }),
    applyOptions: vi.fn(),
    timeScale: vi.fn().mockReturnValue({
      fitContent: vi.fn(),
      applyOptions: vi.fn(),
    }),
    remove: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockMetrics = {
  totalEquityFiat: 10000,
  totalUnrealizedPnlFiat: 500,
  totalRealizedPnlFiat: 100,
  totalCostBasisFiat: 9400,
  totalPnlFiat: 600,
  currency: 'USD',
  roiPercentage: 5,
  isBullish: true,
  realizedIsPositive: true,
  ratesIncomplete: false,
  pricesIncomplete: false,
};

import { I18N_PORT_KEY, CRYPTO_METRICS_PORT_KEY } from "@/core/injectionKeys";

function mountView(
  dataOverrides: Partial<
    ReturnType<typeof portfolioData.usePortfolioData>
  > = {},
) {
  // The fields the real composable exposes as `computed` are mocked as `computed` too — a plain
  // `Ref` is not assignable to `ComputedRef`, and matching the real shape is what keeps the mock
  // substitutable for the thing it stands in for.
  vi.spyOn(portfolioData, "usePortfolioData").mockReturnValue({
    metrics: computed(() => mockMetrics),
    isFetching: computed(() => false),
    isRebuilding: computed(() => false),
    handleRebuild: vi.fn(),
    filteredHoldings: computed(() => []),
    conversionSummary: computed(() => ({ kind: 'UNCONVERTED' }) as const),
    loadError: computed(() => null),
    isModalOpen: ref(false),
    selectedSymbol: ref(""),
    selectedHolding: computed(() => undefined),
    tokenDetails: ref(undefined),
    isFetchingDetails: ref(false),
    handleExpandSymbol: vi.fn(),
    expandedDetailsMap: ref({}),
    handleRowExpand: vi.fn(),
    ...dataOverrides,
  });

  return mount(PortfolioView, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      provide: {
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue("en"),
        },
        [CRYPTO_METRICS_PORT_KEY as symbol]: {
          getKpis: vi.fn().mockResolvedValue({
            totalRoiPercent: 0,
            totalRoiFiat: 0,
            delta24hFiat: 0,
            investedFiat: 0,
            maxDrawdownPercent: 0,
            maxDrawdownFiat: 0,
            recoveredFiat: 0,
            winRatePercent: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalTrades: 0,
            averageR: 0,
            portfolioDispersion: 0,
            bestAsset: {
              symbol: "BTC",
              name: "Bitcoin",
              allocationPercent: 50,
              roiPercent: 10,
            },
            worstAsset: {
              symbol: "XRP",
              name: "Ripple",
              allocationPercent: 10,
              roiPercent: -5,
            },
          }),
        },
      },
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("PortfolioView", () => {
  it("renders the outer flex-col container", () => {
    const wrapper = mountView();
    expect(wrapper.classes()).toContain("flex");
    expect(wrapper.classes()).toContain("flex-col");
  });

  it("shows sync text when rebuilding", () => {
    const wrapper = mountView({ isRebuilding: computed(() => true) });
    expect(wrapper.text()).toContain("portfolio.syncing");
  });

  it("calls handleRebuild on button click", async () => {
    const mockRebuild = vi.fn();
    const wrapper = mountView({ handleRebuild: mockRebuild });

    // The tabs triggers are also buttons in the mock, so we find the one with the sync text
    const buttons = wrapper.findAll("button");
    const syncBtn = buttons.find((b) => b.text().includes("portfolio.sync"));

    await syncBtn!.trigger("click");
    expect(mockRebuild).toHaveBeenCalledOnce();
  });

  it("renders the metrics grid (4 cols on lg)", () => {
    const wrapper = mountView();
    expect(wrapper.find(".grid.lg\\:grid-cols-4").exists()).toBe(true);
  });

  it("displays the mocked KPI data from Colada", () => {
    const wrapper = mountView();
    expect(wrapper.text()).toContain("BTC / XRP");
  });
});
