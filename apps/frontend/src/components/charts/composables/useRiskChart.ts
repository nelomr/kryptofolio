import { computed, type Ref } from "vue";
import type { ChartData, ChartOptions, Plugin } from "chart.js";
import { useI18n } from "@/composables/useI18n";

// Helper to get CSS variables
const getCSSVar = (name: string) => {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
};

// Custom plugin to draw the background risk zones
export const riskZonesPlugin: Plugin<"line"> = {
  id: "riskZones",
  beforeDraw: (chart) => {
    const {
      ctx,
      chartArea,
      scales: { x, y },
    } = chart;
    if (!y || !x) return;

    const excellentColor = getCSSVar("--color-profit") || "#00875a";
    const lossColor = getCSSVar("--color-loss") || "#d14343";
    const textColor = getCSSVar("--color-muted-foreground") || "#6b7280";

    // We define our zones based on Y scale values.
    // Loss: y <= 0
    // Acceptable: 0 < y <= 1
    // Excellent: y > 1 (up to 2 or max)

    // Convert data values to pixel coordinates
    const yMax = y.getPixelForValue(y.max);
    const yExcellentBottom = y.getPixelForValue(1); // above 1 is excellent
    const yAcceptableBottom = y.getPixelForValue(0); // 0 to 1 is acceptable
    const yLossBottom = y.getPixelForValue(y.min); // below 0 is loss

    ctx.save();

    // Excellent Zone Background
    if (yExcellentBottom > yMax) {
      ctx.fillStyle = `${excellentColor}10`; // ~6% opacity
      ctx.fillRect(
        chartArea.left,
        yMax,
        chartArea.right - chartArea.left,
        yExcellentBottom - yMax,
      );

      // Excellent Label
      ctx.fillStyle = excellentColor;
      ctx.font = "500 10px Inter";
      ctx.fillText("EXCELLENT", chartArea.left + 10, yMax + 20);
    }

    // Acceptable Zone Background
    if (yAcceptableBottom > yExcellentBottom) {
      ctx.fillStyle = `${excellentColor}0A`;
      ctx.fillRect(
        chartArea.left,
        yExcellentBottom,
        chartArea.right - chartArea.left,
        yAcceptableBottom - yExcellentBottom,
      );

      // Acceptable Label
      ctx.fillStyle = textColor;
      ctx.font = "500 10px Inter";
      ctx.fillText("ACCEPTABLE", chartArea.left + 10, yExcellentBottom + 20);
    }

    // Loss Zone Background
    if (yLossBottom > yAcceptableBottom) {
      ctx.fillStyle = `${lossColor}0A`;
      ctx.fillRect(
        chartArea.left,
        yAcceptableBottom,
        chartArea.right - chartArea.left,
        yLossBottom - yAcceptableBottom,
      );

      // Loss Label
      ctx.fillStyle = lossColor;
      ctx.font = "500 10px Inter";
      ctx.fillText("LOSS", chartArea.left + 10, yAcceptableBottom + 20);
    }

    // Grid lines for zone borders
    ctx.beginPath();
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Line at 0
    ctx.moveTo(chartArea.left, yAcceptableBottom);
    ctx.lineTo(chartArea.right, yAcceptableBottom);

    // Line at 1
    ctx.moveTo(chartArea.left, yExcellentBottom);
    ctx.lineTo(chartArea.right, yExcellentBottom);

    ctx.stroke();
    ctx.restore();
  },
};

export function useRiskChart(historyRef: Ref<number[] | undefined>) {
  const { t } = useI18n();

  const chartData = computed<ChartData<"line">>(() => {
    const data = historyRef.value || [];
    const brandColor = getCSSVar("--color-brand") || "#1e3a8a";

    return {
      labels: data.map((_, i) => `Point ${i + 1}`),
      datasets: [
        {
          label: "Sharpe Ratio",
          data,
          borderColor: brandColor,
          backgroundColor: `${brandColor}1A`,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: brandColor,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  });

  const chartOptions = computed<ChartOptions<"line">>(() => {
    const data = historyRef.value || [];
    const minVal = Math.min(-0.5, ...data);
    const maxVal = Math.max(2.5, ...data);

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 0,
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          display: false,
          min: minVal,
          max: maxVal,
        },
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
            title: () => "",
            label: (context) => {
              const value = context.parsed.y;
              return `Sharpe: ${value !== null ? value.toFixed(2) : "-"}`;
            },
          },
        },
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
    };
  });

  const sharpeColor = computed(() => {
    const history = historyRef.value || [];
    if (history.length === 0) return "var(--muted)";
    const lastVal = history[history.length - 1];
    if (lastVal >= 1) return "var(--profit)";
    if (lastVal <= 0) return "var(--loss)";
    return "var(--muted)";
  });

  return {
    chartData,
    chartOptions,
    riskZonesPlugin,
    sharpeColor,
  };
}
