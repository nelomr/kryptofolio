<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn('flex flex-col gap-2 w-full h-full min-h-[300px] p-2', props.class)">
    <div class="flex justify-between h-4 w-full mb-4">
      <Skeleton class="h-4 w-[10%]" />
      <Skeleton class="h-4 w-[10%]" />
    </div>
    <Skeleton class="h-full w-full rounded-md" />
  </div>
</template>
