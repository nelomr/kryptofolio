<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { useI18n } from '@/composables/useI18n'

const emit = defineEmits<{ ask: [question: string] }>()

const { t } = useI18n()

const groups = [
  {
    id: 'taxes',
    titleKey: 'advisor.empty.group.taxes',
    questionKeys: ['advisor.empty.question.taxes_review', 'advisor.empty.question.taxes_warnings'],
  },
  {
    id: 'portfolio',
    titleKey: 'advisor.empty.group.portfolio',
    questionKeys: ['advisor.empty.question.portfolio_allocation', 'advisor.empty.question.portfolio_risk'],
  },
] as const
</script>

<template>
  <section data-testid="advisor-empty" class="flex flex-col gap-6 py-4">
    <div class="flex flex-col gap-2 text-center">
      <h3 class="text-sm font-semibold text-fg">{{ t('advisor.empty.title') }}</h3>
      <p class="text-xs text-muted">{{ t('advisor.empty.subtitle') }}</p>
    </div>

    <div v-for="group in groups" :key="group.id" :data-testid="`advisor-suggestions-${group.id}`" class="flex flex-col gap-2">
      <h4 class="text-xs font-medium uppercase tracking-widest text-muted">{{ t(group.titleKey) }}</h4>
      <Button
        v-for="key in group.questionKeys"
        :key="key"
        data-testid="advisor-suggestion"
        variant="outline"
        class="h-auto justify-start whitespace-normal border-border px-3 py-2 text-left text-sm font-normal text-fg hover:bg-surface-2"
        @click="emit('ask', t(key))"
      >
        {{ t(key) }}
      </Button>
    </div>
  </section>
</template>
