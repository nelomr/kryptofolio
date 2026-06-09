<script setup lang="ts">
import type { AssetAllocationItem } from '@/core/domain/ports/ICryptoMetricsPort'

defineProps<{
  items: AssetAllocationItem[]
}>()

const formatFiat = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val).replace(',', ',')
}
</script>

<template>
  <div class="donut-legend flex flex-col gap-1 flex-1 min-w-[200px] xl:w-auto xl:pl-4">
    <div v-for="item in items" :key="item.symbol" class="row flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <span class="swatch w-3 h-3 rounded-sm flex-shrink-0" :style="{ background: item.colorHex }"></span>
      <span class="tk font-bold text-foreground text-[15px] tracking-tight flex items-baseline gap-1.5 flex-1">
        {{ item.symbol }}
        <span class="text-muted-foreground font-normal text-[11px]">{{ item.name }}</span>
      </span>
      <span class="pct num text-[15px] font-semibold whitespace-nowrap">{{ item.allocationPercent }}%</span>
      <span class="eur num text-[15px] text-muted-foreground whitespace-nowrap">{{ formatFiat(item.valueFiat) }}</span>
    </div>
  </div>
</template>
