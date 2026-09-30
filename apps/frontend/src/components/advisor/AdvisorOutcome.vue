<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { RotateCw } from 'lucide-vue-next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/composables/useI18n'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import { isRetryableOutcome, type AdvisorTurnOutcome } from '@/composables/useAdvisorChat'
import { providerFailureCopy, transportMessageKey } from './advisorPresentation'

const props = defineProps<{
  outcome: DeepReadonly<AdvisorTurnOutcome>
  /** Only the last turn can be resent; earlier ones are history. */
  isLast: boolean
  /** What the user asked in this turn, so a refusal can offer to ask it differently. */
  question: string
}>()

const emit = defineEmits<{ retry: []; rephrase: [message: string] }>()

const { t } = useI18n()
const { close } = useAdvisorPanel()

const canRetry = () => props.isLast && isRetryableOutcome(props.outcome)

const needsSettings = () =>
  props.outcome.kind === 'failed' &&
  (props.outcome.code === 'NO_MODEL_AVAILABLE' || props.outcome.code === 'VAULT_LOCKED')

/** Title, body and the settings pointer of a failed turn; a cause-specific text names what failed. */
function failureCopy() {
  const outcome = props.outcome
  if (outcome.kind !== 'failed') return undefined
  if (outcome.code === 'ALL_PROVIDERS_FAILED') {
    const copy = providerFailureCopy(outcome.cause.kind)
    const params = {
      provider: t(`settings.advisor.provider.${outcome.cause.providerId}`),
      model: outcome.cause.modelId,
    }
    return {
      title: t(copy.titleKey, params),
      body: t(copy.bodyKey, params),
      ctaLabel: copy.cta ? t(copy.cta.labelKey) : undefined,
    }
  }
  return {
    title: t(`advisor.failed.${outcome.code}.title`),
    body: t(`advisor.failed.${outcome.code}.body`),
    ctaLabel: needsSettings() ? t('advisor.failed.settings_cta') : undefined,
  }
}
</script>

<template>
  <Alert
    v-if="outcome.kind === 'refused'"
    data-testid="advisor-refused"
    class="border-transparent bg-info-soft text-fg"
  >
    <AlertTitle>{{ t('advisor.refused.title') }}</AlertTitle>
    <AlertDescription class="text-muted">{{ outcome.reason }}</AlertDescription>
    <Button
      v-if="isLast"
      data-testid="advisor-rephrase"
      variant="outline"
      size="sm"
      class="mt-2 h-auto whitespace-normal border-border bg-surface text-left text-fg hover:bg-surface-2"
      @click="emit('rephrase', t('advisor.refused.rephrase.message', { question }))"
    >
      {{ t('advisor.refused.rephrase.label') }}
    </Button>
  </Alert>

  <Alert
    v-else-if="outcome.kind === 'failed'"
    data-testid="advisor-failed"
    :class="[
      'border-transparent text-fg',
      needsSettings() ? 'bg-warning-soft' : 'bg-loss-soft',
    ]"
  >
    <AlertTitle>{{ failureCopy()?.title }}</AlertTitle>
    <AlertDescription class="text-muted">
      {{ failureCopy()?.body }}
    </AlertDescription>
    <RouterLink
      v-if="failureCopy()?.ctaLabel"
      to="/settings"
      class="mt-2 inline-block text-sm font-medium text-fg underline underline-offset-4"
      @click="close"
    >
      {{ failureCopy()?.ctaLabel }}
    </RouterLink>
  </Alert>

  <p
    v-else-if="outcome.kind === 'transport-lost'"
    data-testid="advisor-transport"
    class="rounded-lg bg-loss-soft px-3 py-2 text-xs text-fg"
  >
    {{ t(transportMessageKey(outcome.cause)) }}
  </p>

  <p v-else-if="outcome.kind === 'user-aborted'" data-testid="advisor-stopped" class="text-xs text-muted">
    {{ t('advisor.stopped') }}
  </p>

  <Button
    v-if="canRetry()"
    data-testid="advisor-retry"
    variant="ghost"
    size="sm"
    class="self-start text-muted hover:bg-surface-2 hover:text-fg"
    @click="emit('retry')"
  >
    <RotateCw />
    {{ t('advisor.retry') }}
  </Button>
</template>
