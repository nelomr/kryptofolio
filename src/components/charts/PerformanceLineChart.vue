<script setup lang="ts">
/**
 * PerformanceLineChart — Component description.
 */

import { ref, watch, onMounted } from 'vue'
import { ColorType, AreaSeries, createSeriesMarkers, type ISeriesApi, type Time, type ISeriesMarkersPluginApi } from 'lightweight-charts'
import { useLightweightChart } from '@/composables/useLightweightChart'

interface ChartDataPoint {
  time: string | number
  value: number
  type?: 'deposit' | 'withdrawal'
  amount?: number
}

const props = defineProps<{
  data: ChartDataPoint[]
}>()

const chartContainer = ref<HTMLDivElement | null>(null)
let areaSeries: ISeriesApi<"Area"> | null = null
let seriesMarkersPlugin: ISeriesMarkersPluginApi<Time> | null = null

const { chart } = useLightweightChart(chartContainer, {
  layout: {
    background: { type: ColorType.Solid, color: '#00000000' },
    textColor: 'transparent',
    attributionLogo: false,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { visible: false },
  },
  crosshair: {
    vertLine: { visible: true },
    horzLine: { visible: true },
  },
  rightPriceScale: {
    borderVisible: false,
  },
  timeScale: {
    borderVisible: false,
  },
})

const activeTimeframe = ref('ALL')
const timeframes = ['1D', '1W', '1M', 'YTD', 'ALL']

// Hovered tooltip state
const hoveredValue = ref<number | null>(null)
const hoveredDate = ref<string | null>(null)

function setTimeframe(tf: string) {
  activeTimeframe.value = tf
  if (!chart.value || !props.data.length) return
  
  const lastPoint = props.data[props.data.length - 1]
  const lastTime = typeof lastPoint.time === 'number' ? lastPoint.time : new Date(lastPoint.time).getTime() / 1000
  
  let fromTime = 0
  const SECONDS_IN_DAY = 24 * 60 * 60
  
  switch (tf) {
    case '1D':
      fromTime = lastTime - SECONDS_IN_DAY
      break
    case '1W':
      fromTime = lastTime - 7 * SECONDS_IN_DAY
      break
    case '1M':
      fromTime = lastTime - 30 * SECONDS_IN_DAY
      break
    case 'YTD': {
      const now = new Date()
      const startOfYear = new Date(now.getFullYear(), 0, 1)
      fromTime = startOfYear.getTime() / 1000
      break
    }
    case 'ALL':
    default:
      chart.value.timeScale().fitContent()
      return
  }
  
  chart.value.timeScale().setVisibleRange({
    from: fromTime as Time,
    to: lastTime as Time
  })
}

function updateChartData() {
  if (!areaSeries || !props.data.length) return
  
  areaSeries.setData(props.data.map(p => ({ time: p.time as Time, value: p.value })))
  
  const markers = props.data.filter(p => p.type).map(p => ({
    time: p.time as Time,
    position: p.type === 'deposit' ? 'belowBar' : 'aboveBar',
    color: p.type === 'deposit' ? '#10b981' : '#ef4444',
    shape: p.type === 'deposit' ? 'arrowUp' : 'arrowDown',
    text: `${p.type === 'deposit' ? '+' : '-'}${p.amount}€`
  }))
  
  if (!seriesMarkersPlugin) {
    if (markers.length > 0) {
      seriesMarkersPlugin = createSeriesMarkers(areaSeries, markers as any)
    }
  } else {
    seriesMarkersPlugin.setMarkers(markers as any)
  }
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)
}

const formatDate = (time: number) => {
  return new Date(time * 1000).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (!chart.value) return

  areaSeries = chart.value.addSeries(AreaSeries, {
    lineColor: '#3b82f6',
    topColor: 'rgba(59, 130, 246, 0.25)',
    bottomColor: 'rgba(59, 130, 246, 0.0)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  })

  updateChartData()
  chart.value.timeScale().fitContent()

  chartContainer.value?.addEventListener('mouseenter', () => {
    chart.value?.applyOptions({ layout: { textColor: '#94a3b8' } })
  })
  chartContainer.value?.addEventListener('mouseleave', () => {
    chart.value?.applyOptions({ layout: { textColor: 'transparent' } })
    hoveredValue.value = null
    hoveredDate.value = null
  })

  chart.value.subscribeCrosshairMove((param) => {
    if (!param.time || param.point === undefined || !areaSeries) {
      hoveredValue.value = null
      hoveredDate.value = null
      return
    }
    const data = param.seriesData.get(areaSeries) as any
    if (data) {
      hoveredValue.value = data.value
      hoveredDate.value = formatDate(param.time as number)
    }
  })
})

watch(
  () => props.data,
  (newData) => {
    if (areaSeries && newData.length) {
      updateChartData()
      if (activeTimeframe.value === 'ALL') {
        chart.value?.timeScale().fitContent()
      } else {
        setTimeframe(activeTimeframe.value)
      }
    }
  },
  { deep: true }
)
</script>

<template>
  <div class="flex flex-col w-full h-full relative group">
    <!-- Header Tooltip -->
    <div class="absolute top-2 left-2 z-10 flex flex-col pointer-events-none transition-opacity duration-200" :class="hoveredValue !== null ? 'opacity-100' : 'opacity-0'">
      <span class="text-xs text-muted-foreground">{{ hoveredDate }}</span>
      <span class="text-xl font-bold text-foreground">{{ hoveredValue !== null ? formatCurrency(hoveredValue) : '' }}</span>
    </div>

    <!-- Timeframe Filters -->
    <div class="absolute top-2 right-2 z-10 flex gap-1 bg-background rounded p-1 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
      <button 
        v-for="tf in timeframes" 
        :key="tf"
        @click="setTimeframe(tf)"
        class="text-xs px-2 py-1 rounded transition-colors font-medium"
        :class="activeTimeframe === tf ? 'bg-surface-2 text-fg border border-border' : 'text-muted-foreground hover:bg-surface-2 border border-transparent'"
      >
        {{ tf }}
      </button>
    </div>
    
    <div
      v-if="data.length > 0"
      ref="chartContainer"
      data-testid="performance-chart"
      class="w-full flex-1 min-h-[240px]"
    />
  </div>
</template>
