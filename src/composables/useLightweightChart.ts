import { onMounted, onUnmounted, shallowRef, type Ref } from 'vue'
import { createChart, type IChartApi, type DeepPartial, type ChartOptions } from 'lightweight-charts'

/**
 * Composable to initialize and manage a lightweight-charts instance.
 * Handles resize observer and unmounting automatically.
 */
export function useLightweightChart(
  container: Ref<HTMLElement | null>,
  options?: DeepPartial<ChartOptions>
) {
  const chart = shallowRef<IChartApi | null>(null)

  onMounted(() => {
    if (!container.value) return
    
    chart.value = createChart(container.value, {
      width: container.value.clientWidth,
      height: container.value.clientHeight || 240,
      ...options
    })

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== container.value) return
      const newRect = entries[0].contentRect
      if (chart.value) {
        chart.value.applyOptions({ width: newRect.width, height: newRect.height })
      }
    })

    resizeObserver.observe(container.value)

    onUnmounted(() => {
      resizeObserver.disconnect()
      if (chart.value) {
        chart.value.remove()
        chart.value = null
      }
    })
  })

  return { chart }
}
