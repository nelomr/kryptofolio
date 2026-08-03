import { computed, type Ref } from "vue";
import type { AssetAllocationItem } from "@/core/domain/ports/ICryptoMetricsPort";
import type { ChartData, ChartOptions, Plugin, DoughnutController } from "chart.js";

// Helper to get CSS variables
const getCSSVar = (name: string) => {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
};

// Custom plugin to draw the background track (matching the old SVG behavior)
export const backgroundTrackPlugin: Plugin<"doughnut"> = {
  id: "backgroundTrack",
  beforeDraw: (chart) => {
    const { ctx, chartArea } = chart;
    // Chart#getDatasetMeta() types `.controller` as the base DatasetController;
    // innerRadius/outerRadius are only computed by DoughnutController (chart.js's
    // own public type for it), so we narrow to read them.
    const controller = chart.getDatasetMeta(0).controller as DoughnutController;
    const { innerRadius, outerRadius } = controller;
    if (!innerRadius || !outerRadius) return;

    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    const radius = (innerRadius + outerRadius) / 2;
    const thickness = outerRadius - innerRadius;

    const borderColor = getCSSVar("--color-border") || "#f4f6f8";

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.restore();
  },
};

export function useAssetAllocationChart(
  itemsRef: Ref<AssetAllocationItem[] | undefined>,
) {
  const chartData = computed<ChartData<"doughnut">>(() => {
    const items = itemsRef.value || [];
    return {
      labels: items.map((i) => i.symbol),
      datasets: [
        {
          data: items.map((i) => i.allocationPercent),
          backgroundColor: items.map((i) => i.colorHex),
          borderWidth: 0,
          hoverOffset: 4,
          borderRadius: 0,
        },
      ],
    };
  });

  const chartOptions = computed<ChartOptions<"doughnut">>(() => {
    return {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "74%",
      layout: {
        padding: 4,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: getCSSVar("--color-surface-2") || "#1e293b",
          titleColor: getCSSVar("--color-foreground") || "#f8fafc",
          bodyColor: getCSSVar("--color-muted-foreground") || "#94a3b8",
          borderColor: getCSSVar("--color-border") || "#334155",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const label = context.label || "";
              const value = context.parsed || 0;
              return ` ${label}: ${value}%`;
            },
          },
        },
      },
      animation: {
        animateScale: true,
        animateRotate: true,
        duration: 800,
        easing: "easeOutQuart",
      },
    };
  });

  return {
    chartData,
    chartOptions,
    backgroundTrackPlugin,
  };
}
