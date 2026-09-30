<script setup lang="ts">
import { computed, watch } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdvisorConfigQuery, useAdvisorExecutionProfilesQuery } from '@/composables/queries/useAdvisorQueries'
import { useI18n } from '@/composables/useI18n'
import { localContextWindows } from './advisorSettingsModel'
import { useExecutionProfilesEditor } from './composables/useExecutionProfilesEditor'
import { useModelChainEditor } from './composables/useModelChainEditor'
import ExecutionProfilesEditor from './ExecutionProfilesEditor.vue'
import ModelChainEditor from './ModelChainEditor.vue'

const { t } = useI18n()

const config = useAdvisorConfigQuery()
const profiles = useAdvisorExecutionProfilesQuery()

const chainEditor = useModelChainEditor(computed(() => config.data.value?.chain))
const profilesEditor = useExecutionProfilesEditor(profiles.data)

watch(() => config.data.value, chainEditor.hydrateOnce, { immediate: true })
watch(() => profiles.data.value, profilesEditor.hydrateOnce, { immediate: true })

const providers = computed(() => config.data.value?.providers ?? [])
const localWindows = computed(() => localContextWindows(chainEditor.rows.value))

const loaded = computed(() => config.data.value !== undefined && profiles.data.value !== undefined)
const failed = computed(() => !loaded.value && (config.status.value === 'error' || profiles.status.value === 'error'))
</script>

<template>
  <Card id="advisor-settings" data-testid="advisor-settings" class="scroll-mt-6">
    <CardHeader>
      <CardTitle>{{ t('settings.advisor.title') }}</CardTitle>
      <CardDescription>{{ t('settings.advisor.description') }}</CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="failed" data-testid="advisor-settings-error" role="alert" class="text-sm text-loss">
        {{ t('settings.advisor.load_failed') }}
      </div>

      <div v-else-if="!loaded" data-testid="advisor-settings-loading" class="space-y-4" aria-hidden="true">
        <Skeleton class="h-6 w-40" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-6 w-40" />
        <Skeleton class="h-40 w-full" />
      </div>

      <div v-else class="space-y-10">
        <ModelChainEditor
          :rows="chainEditor.rows.value"
          :providers="providers"
          :row-errors="chainEditor.rowErrors.value"
          :chain-error="chainEditor.chainError.value"
          :save-state="chainEditor.saveState.value"
          @add="chainEditor.add"
          @save="chainEditor.save"
          @update="chainEditor.update"
          @move="chainEditor.move"
          @remove="chainEditor.remove"
        />
        <ExecutionProfilesEditor
          :draft="profilesEditor.draft"
          :selected="profilesEditor.selected.value"
          :errors="profilesEditor.errors.value"
          :local-windows="localWindows"
          :save-state="profilesEditor.saveState.value"
          @select="profilesEditor.select"
          @set-limit="profilesEditor.setLimit"
          @set-tool-budget="profilesEditor.setToolBudget"
          @reset="profilesEditor.resetSelected"
          @save="profilesEditor.save"
        />
      </div>
    </CardContent>
  </Card>
</template>
