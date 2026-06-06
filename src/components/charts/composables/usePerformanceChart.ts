import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import { createChart, ColorType, LineStyle, AreaSeries, LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp } from 'lightweight-charts'
import { useResizeObserver } from '@vueuse/core'
import type { PerformancePoint } from '@/core/domain/ports/ICryptoMetricsRepository'
import { formatCurrency, formatDate } from '@/composables/useFormatters'
import { useI18n } from '@/composables/useI18n'

// Helper to get computed styles for chart colors
const getCSSVar = (name: string) => {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function usePerformanceChart(
  chartContainer: Ref<HTMLElement | null>,
  wrapperContainer: Ref<HTMLElement | null>,
  tooltip: Ref<HTMLElement | null>,
  data: Ref<PerformancePoint[]>
) {
  const { t } = useI18n()
  
  let chart: IChartApi | null = null
  let areaSeries: ISeriesApi<"Area"> | null = null
  let costBasisSeries: ISeriesApi<"Line"> | null = null

  const initChart = () => {
    if (!chartContainer.value) return

    const brandColor = getCSSVar('--color-brand') || '#1e3a8a'
    const brandSoftColor = getCSSVar('--color-brand-soft') || 'rgba(30, 58, 138, 0.2)'
    const textColor = getCSSVar('--color-muted-foreground') || '#64748b'
    const gridColor = getCSSVar('--color-border') || '#e2e8f0'
    const costColor = getCSSVar('--color-muted-foreground') || '#94a3b8'

    chart = createChart(chartContainer.value, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: textColor,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      crosshair: {
        vertLine: {
          width: 1,
          color: textColor,
          style: LineStyle.Dashed,
          labelBackgroundColor: brandColor,
        },
        horzLine: {
          width: 1,
          color: textColor,
          style: LineStyle.Dashed,
          labelBackgroundColor: brandColor,
        },
      },
      handleScroll: false,
      handleScale: false,
    })

    areaSeries = chart.addSeries(AreaSeries, {
      lineColor: brandColor,
      topColor: brandSoftColor,
      bottomColor: 'rgba(0, 0, 0, 0)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    })

    costBasisSeries = chart.addSeries(LineSeries, {
      color: costColor,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    })

    // Setup Crosshair Tooltip
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!tooltip.value || !wrapperContainer.value || !chartContainer.value) return

      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainer.value.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainer.value.clientHeight
      ) {
        tooltip.value.style.opacity = '0'
        return
      }

      const value = param.seriesData.get(areaSeries!) as any
      const costValue = param.seriesData.get(costBasisSeries!) as any

      if (!value) {
        tooltip.value.style.opacity = '0'
        return
      }

      const price = value.value ?? value.close
      const cost = costValue ? (costValue.value ?? costValue.close) : null

      // Format tooltip content
      let tooltipHtml = `<div class="text-muted-foreground font-medium mb-1 border-b border-border/50 pb-1">${formatDate(param.time as string)}</div>`
      tooltipHtml += `<div class="flex justify-between gap-4 mb-0.5"><span class="text-foreground">${t('portfolio.metrics_tabs.performance.tooltip.equity')}</span> <span class="font-semibold tabular-nums">${formatCurrency(price)}</span></div>`
      
      if (cost !== null) {
        tooltipHtml += `<div class="flex justify-between gap-4"><span class="text-muted-foreground">${t('portfolio.metrics_tabs.performance.tooltip.cost')}</span> <span class="font-semibold tabular-nums text-muted-foreground">${formatCurrency(cost)}</span></div>`
      }

      tooltip.value.innerHTML = tooltipHtml
      tooltip.value.style.opacity = '1'

      // Position tooltip
      const coordinate = areaSeries!.priceToCoordinate(price)
      if (coordinate === null) return
      
      const tooltipWidth = 150
      const tooltipHeight = 80
      
      let left = param.point.x + 15
      if (left + tooltipWidth > chartContainer.value.clientWidth) {
        left = param.point.x - tooltipWidth - 15
      }
      
      let top = param.point.y - tooltipHeight / 2
      if (top < 0) top = 0
      if (top + tooltipHeight > chartContainer.value.clientHeight) {
        top = chartContainer.value.clientHeight - tooltipHeight
      }

      tooltip.value.style.left = left + 'px'
      tooltip.value.style.top = top + 'px'
    })

    // Initial Format data
    updateData(data.value)
  }

  const updateData = (newData: PerformancePoint[]) => {
    if (!areaSeries || !costBasisSeries) return

    // Remove duplicates by time to prevent lightweight-charts errors
    const uniqueDataMap = new Map<number, PerformancePoint>()
    newData.forEach(p => uniqueDataMap.set(p.timestamp, p))
    
    const sortedData = Array.from(uniqueDataMap.values()).sort((a, b) => a.timestamp - b.timestamp)

    const areaData = sortedData.map(p => ({
      time: p.timestamp as UTCTimestamp,
      value: p.valueFiat,
    }))

    const costData = sortedData.map(p => ({
      time: p.timestamp as UTCTimestamp,
      value: p.costBasisFiat,
    }))

    areaSeries.setData(areaData)
    costBasisSeries.setData(costData)
    
    if (chart && areaData.length > 0) {
      chart.timeScale().fitContent()
    }
  }

  watch(data, (newData) => {
    updateData(newData)
  }, { deep: true })

  onMounted(() => {
    initChart()
  })

  onUnmounted(() => {
    if (chart) {
      chart.remove()
      chart = null
    }
  })

  useResizeObserver(chartContainer, (entries) => {
    if (!chart || entries.length === 0) return
    const { width, height } = entries[0].contentRect
    chart.applyOptions({ width, height })
  })

  return {
    updateData
  }
}
