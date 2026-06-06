<script setup lang="ts">
/**
 * AssetCell — Component description.
 */

import { CryptoIcon } from '@/components/common/CryptoIcon'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

defineProps<{
  symbol: string
  onExpand: (symbol: string) => void
}>()
</script>

<template>
  <div 
    class="flex items-center gap-3 py-2 cursor-pointer group/asset"
    @click="onExpand(symbol)"
  >
    <CryptoIcon 
      :symbol="symbol" 
      :size="32" 
      colored
      class="bg-linear-to-r from-primary/20 to-primary/5 p-1 rounded-lg border border-primary/10 group-hover/asset:border-primary/40 transition-colors"
    />
    <div>
      <span class="font-black block text-sm tracking-tight group-hover/asset:text-primary transition-colors">
        {{ symbol }}
      </span>
      <span class="text-[9px] text-muted-foreground uppercase leading-none font-bold tracking-widest opacity-60">
        {{ t('table.asset_type_crypto') }}
      </span>
    </div>
  </div>
</template>

