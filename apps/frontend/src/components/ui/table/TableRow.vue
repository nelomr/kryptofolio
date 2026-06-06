<script setup lang="ts">
/**
 * TableRow — Component description.
 */

import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <tr :class="cn('border-b transition-colors', props.class)">
    <slot />
  </tr>
</template>
