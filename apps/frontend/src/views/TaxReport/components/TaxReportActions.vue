<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RefreshCw, Upload } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const emit = defineEmits<{
  (e: 'sync'): void
  (e: 'upload'): void
}>()

const { t } = useI18n()
</script>

<template>
  <!-- Sync Web3 Button (Disabled) -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="inline-block">
          <Button
            variant="secondary"
            disabled
            class="gap-2"
            @click="emit('sync')"
          >
            <RefreshCw class="h-4 w-4" />
            <span class="hidden sm:inline">{{ t('tax.header.sync') }}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{{ t('tax.header.pending') }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>

  <!-- Upload CSV Button (Disabled) -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="inline-block">
          <Button
            variant="secondary"
            disabled
            class="gap-2"
            @click="emit('upload')"
          >
            <Upload class="h-4 w-4" />
            <span class="hidden sm:inline">{{ t('tax.header.upload') }}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{{ t('tax.header.pending') }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
