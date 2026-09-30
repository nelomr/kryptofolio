<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import type { SaveState } from './advisorSettingsModel'

const props = defineProps<{
  state: SaveState
  testId: string
  savingKey: string
  savedKey: string
  failedKey: string
}>()

const { t } = useI18n()

const message = computed(() => {
  switch (props.state.kind) {
    case 'saving':
      return t(props.savingKey)
    case 'saved':
      return t(props.savedKey)
    case 'failed':
      return t(props.failedKey)
    case 'idle':
      return undefined
  }
})
</script>

<template>
  <p
    v-if="message !== undefined"
    :data-testid="testId"
    :data-state="state.kind"
    :role="state.kind === 'failed' ? 'alert' : 'status'"
    :class="[
      'text-sm',
      state.kind === 'failed' ? 'text-loss' : state.kind === 'saved' ? 'text-profit' : 'text-muted',
    ]"
  >
    {{ message }}
  </p>
</template>
