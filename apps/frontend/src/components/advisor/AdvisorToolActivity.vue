<script setup lang="ts">
import { AlertTriangle, Check, Minus } from 'lucide-vue-next'
import type { DeepReadonly } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/composables/useI18n'
import type { AdvisorToolActivity } from '@/composables/useAdvisorChat'

const props = defineProps<{
  tools: DeepReadonly<AdvisorToolActivity[]>
  /** False once the run is over: a call that never reported back is interrupted, not still running. */
  live: boolean
}>()

function stateOf(activity: DeepReadonly<AdvisorToolActivity>): string {
  if (activity.status.kind === 'running' && !props.live) return 'interrupted'
  return activity.status.kind
}

const { t } = useI18n()
</script>

<template>
  <ul v-if="tools.length > 0" class="flex flex-col gap-1">
    <li
      v-for="activity in tools"
      :key="activity.callId"
      :data-testid="`advisor-tool-${activity.callId}`"
      :data-state="stateOf(activity)"
      class="flex items-center gap-2 text-xs text-muted"
    >
      <Skeleton v-if="stateOf(activity) === 'running'" class="h-3 w-3 rounded-full" />
      <Check v-else-if="stateOf(activity) === 'finished'" class="h-3 w-3 text-profit" />
      <Minus v-else-if="stateOf(activity) === 'interrupted'" class="h-3 w-3 text-muted-2" />
      <AlertTriangle v-else class="h-3 w-3 text-warning" />
      <span>{{ t(`advisor.tool.${activity.tool}`) }}</span>
      <span class="sr-only">{{ t(`advisor.tool.status.${stateOf(activity)}`) }}</span>
    </li>
  </ul>
</template>
