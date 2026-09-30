<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { useI18n } from '@/composables/useI18n'
import type { AdvisorTurn } from '@/composables/useAdvisorChat'
import AdvisorMarkdown from './AdvisorMarkdown.vue'
import AdvisorOutcome from './AdvisorOutcome.vue'
import AdvisorToolActivity from './AdvisorToolActivity.vue'

defineProps<{ turn: DeepReadonly<AdvisorTurn>; isLast: boolean }>()

const { t } = useI18n()

const emit = defineEmits<{ retry: []; rephrase: [message: string]; navigate: [path: string]; rendered: [] }>()
</script>

<template>
  <article class="flex flex-col gap-2" data-testid="advisor-turn">
    <p class="ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl bg-surface-3 px-3 py-2 text-sm text-fg">
      {{ turn.message }}
    </p>

    <AdvisorToolActivity :tools="turn.tools" :live="turn.outcome.kind === 'streaming'" />

    <div
      v-if="turn.answer !== '' || turn.outcome.kind === 'streaming'"
      data-testid="advisor-answer"
      class="text-sm text-fg"
    >
      <AdvisorMarkdown
        :source="turn.answer"
        :streaming="turn.outcome.kind === 'streaming'"
        @navigate="(path) => emit('navigate', path)"
        @rendered="emit('rendered')"
      /><span
        v-if="turn.outcome.kind === 'streaming'"
        data-testid="advisor-caret"
        aria-hidden="true"
        class="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-fg motion-safe:animate-pulse"
      />
    </div>

    <span
      v-if="turn.outcome.kind === 'done' && turn.outcome.figuresIncomplete"
      data-testid="advisor-incomplete"
      :title="t('advisor.figures_incomplete.hint')"
      class="self-start rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
    >
      {{ t('advisor.figures_incomplete.label') }}
    </span>

    <AdvisorOutcome
      :outcome="turn.outcome"
      :is-last="isLast"
      :question="turn.message"
      @retry="emit('retry')"
      @rephrase="(message) => emit('rephrase', message)"
    />

    <p
      v-if="turn.outcome.kind === 'done' && turn.outcome.disclaimer"
      data-testid="advisor-disclaimer"
      class="text-xs text-muted"
    >
      {{ t('advisor.disclaimer') }}
    </p>

    <p
      v-if="turn.outcome.kind === 'done'"
      data-testid="advisor-steps"
      :aria-label="t('advisor.steps.label')"
      :title="t('advisor.steps.label')"
      class="font-mono text-xs text-muted"
    >{{ turn.outcome.stepsUsed }} / {{ turn.outcome.maxSteps }}</p>
  </article>
</template>
