<script setup lang="ts">
/**
 * TokenDetailsHeader — Component description.
 */

import { CryptoIcon } from "@/components/common/CryptoIcon";
import { X } from 'lucide-vue-next';
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

defineProps<{
  symbol: string
}>()

defineEmits(['close'])
</script>

<template>
  <div class="px-6 py-5 border-b border-border bg-muted/10 flex justify-between items-center">
    <div class="flex items-center gap-3">
      <CryptoIcon :symbol="symbol" :size="40" colored />
      <div>
        <h3 class="text-xl leading-6 font-bold text-foreground tracking-tight" id="modal-headline">
          {{ t('token.details.title').replace('{symbol}', symbol) }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t('token.details.subtitle') }}
        </p>
      </div>
    </div>
    <button
      @click="$emit('close')"
      class="text-muted-foreground hover:text-foreground transition-colors bg-muted/20 hover:bg-muted/40 p-2 rounded-full focus:outline-none"
    >
      <X class="h-5 w-5" />
    </button>
  </div>
</template>

