<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL'

const props = defineProps<{
  modelValue: TimeRange
  ranges?: TimeRange[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: TimeRange): void
}>()

const defaultRanges: TimeRange[] = ['1D', '1W', '1M', '1Y', 'ALL']
const ranges = props.ranges ?? defaultRanges

const filterVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-muted hover:text-foreground',
  {
    variants: {
      active: {
        true: 'bg-surface-3 text-foreground shadow-sm',
        false: 'bg-transparent text-muted-foreground hover:bg-surface-2',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)
</script>

<template>
  <div class="inline-flex h-9 items-center justify-center rounded-md bg-surface-2 p-1 text-muted-foreground">
    <button
      v-for="range in ranges"
      :key="range"
      type="button"
      :class="cn(filterVariants({ active: range === modelValue }))"
      @click="emit('update:modelValue', range)"
    >
      {{ range }}
    </button>
  </div>
</template>
