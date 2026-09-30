<script setup lang="ts">
import { computed } from 'vue'
import { AI_PROVIDER_IDS, type AiProviderId } from '@kryptofolio/shared-types'
import { ArrowDown, ArrowUp, TriangleAlert, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/composables/useI18n'
import { hasDaemonOnlySuffix, rowProfile, type ChainDraftRow, type ChainRowError, type CredentialFlag } from './advisorSettingsModel'
import type { RowPatch } from './composables/useModelChainEditor'

const props = defineProps<{
  row: ChainDraftRow
  position: number
  isFirst: boolean
  isLast: boolean
  error: ChainRowError | undefined
  credential: CredentialFlag | undefined
}>()

const emit = defineEmits<{
  update: [patch: RowPatch]
  'move-up': []
  'move-down': []
  remove: []
}>()

const { t } = useI18n()

const profile = computed(() => rowProfile(props.row))
const showSuffixHint = computed(() => hasDaemonOnlySuffix(props.row))
const position = computed(() => String(props.position))

function isProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDER_IDS.some((id) => id === value)
}

function onProvider(value: unknown): void {
  if (isProviderId(value)) emit('update', { providerId: value })
}
</script>

<template>
  <li data-testid="chain-entry" class="space-y-3 rounded-lg border border-border-soft bg-surface-2 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="num text-xs text-muted">{{ t('settings.advisor.chain.entry.position', { position }) }}</span>
      <Badge
        variant="outline"
        data-testid="entry-locality"
        :data-locality="profile === 'local' ? 'local' : 'cloud'"
        :title="profile === 'local' ? t('settings.advisor.locality.local_hint') : t('settings.advisor.locality.cloud_hint')"
        :class="[
          'border-transparent font-mono text-xs font-normal',
          profile === 'local' ? 'bg-surface-3 text-muted' : 'bg-warning-soft text-warning',
        ]"
      >
        {{ profile === 'local' ? t('settings.advisor.locality.local') : t('settings.advisor.locality.cloud') }}
      </Badge>
      <Badge
        variant="outline"
        data-testid="entry-profile"
        :data-profile="profile"
        class="border-border font-mono text-xs font-normal text-muted"
      >
        {{ profile === 'local' ? t('settings.advisor.profile.local') : t('settings.advisor.profile.metered') }}
      </Badge>
      <div class="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="entry-move-up"
          :aria-label="t('settings.advisor.chain.entry.move_up', { position })"
          :disabled="isFirst"
          @click="emit('move-up')"
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="entry-move-down"
          :aria-label="t('settings.advisor.chain.entry.move_down', { position })"
          :disabled="isLast"
          @click="emit('move-down')"
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="entry-remove"
          :aria-label="t('settings.advisor.chain.entry.remove', { position })"
          @click="emit('remove')"
        >
          <Trash2 />
        </Button>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="space-y-1">
        <label class="text-sm font-medium text-fg-2" :for="`entry-provider-${row.key}`">
          {{ t('settings.advisor.chain.entry.provider') }}
        </label>
        <Select :model-value="row.providerId" @update:model-value="onProvider">
          <SelectTrigger :id="`entry-provider-${row.key}`" data-testid="entry-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="id in AI_PROVIDER_IDS" :key="id" :value="id">
              {{ t(`settings.advisor.provider.${id}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-1">
        <label class="text-sm font-medium text-fg-2" :for="`entry-model-${row.key}`">
          {{ t('settings.advisor.chain.entry.model') }}
        </label>
        <Input
          :id="`entry-model-${row.key}`"
          data-testid="entry-model"
          class="font-mono"
          :model-value="row.modelId"
          :placeholder="t('settings.advisor.chain.entry.model_placeholder')"
          :aria-invalid="error === 'model_required' ? 'true' : undefined"
          @update:model-value="(value) => emit('update', { modelId: String(value) })"
        />
        <p v-if="showSuffixHint" data-testid="entry-suffix-hint" class="text-xs text-muted">
          {{ t('settings.advisor.chain.entry.cloud_suffix_hint') }}
        </p>
      </div>

      <div v-if="profile === 'local'" class="space-y-1 md:col-span-2">
        <label class="text-sm font-medium text-fg-2" :for="`entry-context-window-${row.key}`">
          {{ t('settings.advisor.chain.entry.context_window') }}
        </label>
        <Input
          :id="`entry-context-window-${row.key}`"
          data-testid="entry-context-window"
          type="number"
          inputmode="numeric"
          step="1"
          class="num md:w-56"
          :model-value="row.contextWindow"
          :aria-invalid="error === 'context_window_required' ? 'true' : undefined"
          @update:model-value="(value) => emit('update', { contextWindow: String(value) })"
        />
        <p class="text-xs text-muted">{{ t('settings.advisor.chain.entry.context_window_hint') }}</p>
      </div>
    </div>

    <p v-if="error !== undefined" data-testid="entry-error" role="alert" class="text-sm text-loss">
      {{ t(`settings.advisor.chain.error.${error}`) }}
    </p>

    <p
      v-if="credential !== undefined"
      data-testid="entry-credential-flag"
      :data-state="credential"
      class="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
    >
      <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
      <span>{{ t(`settings.advisor.credential.${credential}`) }}</span>
      <a href="#vault-credentials" class="font-medium underline underline-offset-2">
        {{ t('settings.advisor.credential.link') }}
      </a>
    </p>
  </li>
</template>
