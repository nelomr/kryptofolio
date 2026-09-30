<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/composables/useI18n'
import type { AdvisorProviderStatus } from '@/core/domain/models/AdvisorEntities'
import {
  credentialFlag,
  type ChainDraftRow,
  type ChainRowError,
  type SaveState,
} from './advisorSettingsModel'
import type { RowPatch } from './composables/useModelChainEditor'
import ModelChainEntryRow from './ModelChainEntryRow.vue'
import SaveStatus from './SaveStatus.vue'

defineProps<{
  rows: readonly ChainDraftRow[]
  providers: readonly AdvisorProviderStatus[]
  rowErrors: ReadonlyMap<number, ChainRowError>
  chainError: 'empty' | 'invalid' | undefined
  saveState: SaveState
}>()

const emit = defineEmits<{
  add: []
  save: []
  update: [key: number, patch: RowPatch]
  move: [key: number, offset: -1 | 1]
  remove: [key: number]
}>()

const { t } = useI18n()
</script>

<template>
  <section data-testid="model-chain" class="space-y-4">
    <div class="space-y-1">
      <h3 class="text-lg font-semibold text-fg">{{ t('settings.advisor.chain.title') }}</h3>
      <p class="text-sm text-muted">{{ t('settings.advisor.chain.description') }}</p>
    </div>

    <div class="space-y-4">
      <div
        v-if="rows.length === 0"
        data-testid="chain-empty"
        class="space-y-1 rounded-lg border border-dashed border-border bg-surface-2 p-4"
      >
        <p class="text-sm font-medium text-fg-2">{{ t('settings.advisor.chain.empty.title') }}</p>
        <p class="text-sm text-muted">{{ t('settings.advisor.chain.empty.body') }}</p>
      </div>

      <ol v-else class="space-y-3">
        <ModelChainEntryRow
          v-for="(row, index) in rows"
          :key="row.key"
          :row="row"
          :position="index + 1"
          :is-first="index === 0"
          :is-last="index === rows.length - 1"
          :error="rowErrors.get(row.key)"
          :credential="credentialFlag(row, providers)"
          @update="(patch) => emit('update', row.key, patch)"
          @move-up="emit('move', row.key, -1)"
          @move-down="emit('move', row.key, 1)"
          @remove="emit('remove', row.key)"
        />
      </ol>

      <p v-if="chainError !== undefined" data-testid="chain-error" role="alert" class="text-sm text-loss">
        {{ t(`settings.advisor.chain.error.${chainError}`) }}
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" data-testid="chain-add" @click="emit('add')">
          <Plus />
          {{ t('settings.advisor.chain.add') }}
        </Button>
        <Button
          type="button"
          data-testid="chain-save"
          :disabled="saveState.kind === 'saving'"
          @click="emit('save')"
        >
          {{ saveState.kind === 'saving' ? t('settings.advisor.chain.saving') : t('settings.advisor.chain.save') }}
        </Button>
        <SaveStatus
          :state="saveState"
          test-id="chain-status"
          saving-key="settings.advisor.chain.saving"
          saved-key="settings.advisor.chain.saved"
          failed-key="settings.advisor.chain.failed"
        />
      </div>
    </div>
  </section>
</template>
