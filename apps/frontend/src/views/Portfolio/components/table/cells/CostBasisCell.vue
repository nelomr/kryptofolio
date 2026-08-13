<script setup lang="ts">
/**
 * A cost basis and the outcome of expressing it in the display currency.
 *
 * The unconvertible arm shows the real number in the currency it is actually denominated in, marked
 * as such. A blank, a dash or a zero would each be indistinguishable from a genuine figure of that
 * shape — and a zero cost basis reads as a 100% gain.
 */

import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import type { ConvertedAmount } from '@kryptofolio/shared-types'
import { describeConvertedAmount } from '@/composables/useConvertedAmountDisplay'

const props = defineProps<{ costBasis: ConvertedAmount }>()

const { t } = useI18n()

const display = computed(() => describeConvertedAmount(props.costBasis))
</script>

<template>
  <div class="flex flex-col items-end gap-0.5">
    <span class="font-mono text-xs tabular-nums" :class="display.kind === 'UNCONVERTIBLE' ? 'text-warning' : 'text-muted-foreground'">
      {{ display.text }}
    </span>

    <span
      v-if="display.kind === 'UNCONVERTIBLE'"
      data-testid="cost-basis-unconverted"
      class="text-[9px] font-black uppercase tracking-widest text-warning"
    >
      {{ t('portfolio.conversion.unconverted') }}
    </span>

    <span
      v-else-if="display.kind === 'CONVERTED'"
      data-testid="cost-basis-rate"
      class="font-mono text-[9px] tabular-nums text-muted-2"
    >
      {{ display.rate }} · {{ display.rateDate }}
    </span>
  </div>
</template>
