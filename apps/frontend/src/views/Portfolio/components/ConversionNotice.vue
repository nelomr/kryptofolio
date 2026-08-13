<script setup lang="ts">
/**
 * States that the figures on screen are converted, and which rates produced them.
 *
 * Without this a converted number is indistinguishable from a number the user's exchange reported.
 * The rate dates are listed rather than summarised because two lots of the same asset legitimately
 * convert at different dates, and a single "rate applied" would be a lie in that common case.
 */

import { computed } from 'vue'
import { AlertTriangle, ArrowLeftRight } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import type { ConversionSummary } from '@/composables/useConvertedAmountDisplay'

const props = defineProps<{ summary: ConversionSummary }>()

const { t } = useI18n()

const converted = computed(() =>
  props.summary.kind === 'UNCONVERTED' ? null : props.summary,
)

const unconvertibleCount = computed(() =>
  props.summary.kind === 'PARTIALLY_CONVERTED' ? props.summary.unconvertibleCount : 0,
)
</script>

<template>
  <div
    v-if="converted"
    data-testid="conversion-notice"
    class="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-surface-2 px-3 py-2 text-sm"
  >
    <ArrowLeftRight class="h-4 w-4 text-muted-foreground" />
    <span class="text-muted-foreground">
      {{ t('portfolio.conversion.notice') }}
    </span>
    <span class="font-mono font-semibold tabular-nums">{{ converted.displayCurrency }}</span>
    <span class="text-muted-foreground">{{ t('portfolio.conversion.rate_basis') }}</span>
    <span class="font-mono text-xs tabular-nums text-muted-foreground">
      {{ converted.rateDates.join(', ') }}
    </span>

    <span
      v-if="unconvertibleCount > 0"
      data-testid="conversion-incomplete"
      class="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-2 py-1 text-warning"
    >
      <AlertTriangle class="h-4 w-4" />
      <span class="font-mono tabular-nums">{{ unconvertibleCount }}</span>
      <span>{{ t('portfolio.conversion.incomplete') }}</span>
    </span>
  </div>
</template>
