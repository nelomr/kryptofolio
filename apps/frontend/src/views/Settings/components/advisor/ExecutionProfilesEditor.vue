<script setup lang="ts">
import { computed } from 'vue'
import { ADVISOR_TOOL_NAMES, deriveLocalRunBudget, deriveLocalToolBudget, type AdvisorToolName } from '@kryptofolio/shared-types'
import { RotateCcw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/composables/useI18n'
import {
  LIMIT_FIELDS,
  limitErrorKey,
  toolBudgetErrorKey,
  type ExecutionProfilesDraft,
  type LimitErrors,
  type LimitField,
  type LimitFieldError,
  type ProfileName,
  type SaveState,
} from './advisorSettingsModel'
import SaveStatus from './SaveStatus.vue'

const props = defineProps<{
  draft: ExecutionProfilesDraft
  selected: ProfileName
  errors: LimitErrors
  localWindows: readonly { key: number; modelId: string; contextWindow: number }[]
  saveState: SaveState
}>()

const emit = defineEmits<{
  select: [profile: ProfileName]
  'set-limit': [profile: ProfileName, field: LimitField, value: string]
  'set-tool-budget': [tool: AdvisorToolName, value: string]
  reset: []
  save: []
}>()

const { t } = useI18n()

const PROFILES: readonly ProfileName[] = ['metered', 'local']

const current = computed(() => props.draft[props.selected])

function errorText(error: LimitFieldError): string {
  return error.kind === 'max'
    ? t('settings.advisor.limits.error.max', { max: String(error.max) })
    : t('settings.advisor.limits.error.whole_number')
}
</script>

<template>
  <section data-testid="limits" class="space-y-6">
    <div class="space-y-1">
      <h3 class="text-lg font-semibold text-fg">{{ t('settings.advisor.limits.title') }}</h3>
      <p class="text-sm text-muted">{{ t('settings.advisor.limits.description') }}</p>
    </div>

    <div class="space-y-6">
      <div role="group" :aria-label="t('settings.advisor.limits.profile_group')" class="flex gap-1">
        <Button
          v-for="profile in PROFILES"
          :key="profile"
          type="button"
          size="sm"
          :variant="selected === profile ? 'secondary' : 'ghost'"
          :data-testid="`profile-tab-${profile}`"
          :aria-pressed="selected === profile"
          @click="emit('select', profile)"
        >
          {{ t(`settings.advisor.limits.profile.${profile}`) }}
        </Button>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="field in LIMIT_FIELDS" :key="field" class="space-y-1">
          <label class="text-sm font-medium text-fg-2" :for="`limit-${selected}-${field}`">
            {{ t(`settings.advisor.limits.field.${field}`) }}
          </label>
          <Input
            :id="`limit-${selected}-${field}`"
            :data-testid="`limit-input-${field}`"
            type="number"
            inputmode="numeric"
            step="1"
            class="num"
            :model-value="current[field]"
            :aria-invalid="errors.has(limitErrorKey(selected, field)) ? 'true' : undefined"
            :aria-describedby="errors.has(limitErrorKey(selected, field)) ? `limit-${selected}-${field}-error` : undefined"
            @update:model-value="(value) => emit('set-limit', selected, field, String(value))"
          />
          <template v-for="error in [errors.get(limitErrorKey(selected, field))]" :key="field">
            <span
              v-if="error !== undefined"
              :id="`limit-${selected}-${field}-error`"
              :data-testid="`limit-error-${field}`"
              role="alert"
              class="text-sm text-loss"
            >
              {{ errorText(error) }}
            </span>
          </template>
        </div>
      </div>

      <section v-if="selected === 'metered'" class="space-y-3">
        <div class="space-y-1">
          <h4 class="text-sm font-semibold text-fg">{{ t('settings.advisor.limits.tool_budgets.title') }}</h4>
          <p class="text-sm text-muted">{{ t('settings.advisor.limits.tool_budgets.description') }}</p>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div v-for="tool in ADVISOR_TOOL_NAMES" :key="tool" class="space-y-1">
            <label class="text-sm font-medium text-fg-2" :for="`budget-${tool}`">
              {{ t(`advisor.tool.${tool}`) }}
            </label>
            <Input
              :id="`budget-${tool}`"
              :data-testid="`budget-input-${tool}`"
              type="number"
              inputmode="numeric"
              step="1"
              class="num"
              :model-value="draft.metered.toolBudgets[tool]"
              :aria-invalid="errors.has(toolBudgetErrorKey(tool)) ? 'true' : undefined"
              @update:model-value="(value) => emit('set-tool-budget', tool, String(value))"
            />
            <template v-for="error in [errors.get(toolBudgetErrorKey(tool))]" :key="tool">
              <span
                v-if="error !== undefined"
                :data-testid="`budget-error-${tool}`"
                role="alert"
                class="text-sm text-loss"
              >
                {{ errorText(error) }}
              </span>
            </template>
          </div>
        </div>
      </section>

      <section v-else data-testid="derived-budgets" class="space-y-3">
        <div class="space-y-1">
          <h4 class="text-sm font-semibold text-fg">{{ t('settings.advisor.limits.local_budgets.title') }}</h4>
          <p class="text-sm text-muted">{{ t('settings.advisor.limits.local_budgets.description') }}</p>
        </div>
        <p v-if="localWindows.length === 0" data-testid="derived-budgets-none" class="text-sm text-muted">
          {{ t('settings.advisor.limits.local_budgets.none') }}
        </p>
        <dl
          v-for="entry in localWindows"
          :key="entry.key"
          data-testid="derived-entry"
          class="grid gap-1 rounded-lg border border-border-soft bg-surface-2 p-4 text-sm md:grid-cols-[1fr_auto]"
        >
          <dt class="font-mono text-fg-2 md:col-span-2">{{ entry.modelId }}</dt>
          <dt class="text-muted">{{ t('settings.advisor.limits.local_budgets.tool') }}</dt>
          <dd data-testid="derived-tool-budget" class="num text-fg">
            {{ deriveLocalToolBudget(entry.contextWindow) }} {{ t('settings.advisor.limits.local_budgets.unit') }}
          </dd>
          <dt class="text-muted">{{ t('settings.advisor.limits.local_budgets.run') }}</dt>
          <dd data-testid="derived-run-budget" class="num text-fg">
            {{ deriveLocalRunBudget(entry.contextWindow) }} {{ t('settings.advisor.limits.local_budgets.unit') }}
          </dd>
        </dl>
      </section>

      <div class="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" data-testid="limits-reset" @click="emit('reset')">
          <RotateCcw />
          {{ t('settings.advisor.limits.reset') }}
        </Button>
        <Button
          type="button"
          data-testid="limits-save"
          :disabled="saveState.kind === 'saving'"
          @click="emit('save')"
        >
          {{ saveState.kind === 'saving' ? t('settings.advisor.limits.saving') : t('settings.advisor.limits.save') }}
        </Button>
        <SaveStatus
          :state="saveState"
          test-id="limits-status"
          saving-key="settings.advisor.limits.saving"
          saved-key="settings.advisor.limits.saved"
          failed-key="settings.advisor.limits.failed"
        />
      </div>
    </div>
  </section>
</template>
