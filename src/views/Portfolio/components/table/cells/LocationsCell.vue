<script setup lang="ts">
/**
 * LocationsCell — Component description.
 */

import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { CryptoIcon } from '@/components/common/CryptoIcon'
import type { CryptoAssetEntity } from '@/core/domain/models/PortfolioEntities'
import type { CSSProperties } from 'vue'
import { getDeterministicHue } from '@/lib/utils'

const props = defineProps<{ row: CryptoAssetEntity; isLoading: boolean }>()
const locs = computed(() => props.row.portfolioLocations || [])
</script>

<template>
  <div v-if="locs.length" class="text-right flex justify-end gap-1.5 items-center">
    <Badge
      v-for="loc in locs"
      :key="loc"
      variant="outline"
      class="text-[8px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1 text-[hsl(var(--badge-hue),75%,35%)] dark:text-[hsl(var(--badge-hue),85%,75%)] bg-[hsla(var(--badge-hue),80%,50%,0.12)] border-[hsla(var(--badge-hue),80%,50%,0.2)] hover:bg-[hsla(var(--badge-hue),80%,50%,0.2)]"
      :style="{ '--badge-hue': getDeterministicHue(loc) } as CSSProperties"
    >
      <CryptoIcon :symbol="loc" :size="10" colored />
      {{ loc }}
    </Badge>
  </div>
  <div v-else class="text-right opacity-30 text-[8px] font-black uppercase">
    {{ isLoading ? "Procesando..." : "General" }}
  </div>
</template>

