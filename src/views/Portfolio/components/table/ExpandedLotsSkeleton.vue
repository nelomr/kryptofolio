<script setup lang="ts">
/**
 * ExpandedLotsSkeleton — Component description.
 */

import { TableRow, TableCell } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(defineProps<{
  count?: number
}>(), {
  count: 3
})
</script>

<template>
  <TableRow v-for="i in count" :key="`skeleton-${i}`" class="hover:bg-transparent border-b border-border/5">
    <TableCell class="py-3 w-10 pl-3">
       <Skeleton class="w-6 h-6 rounded-full opacity-20" />
    </TableCell>
    <TableCell class="py-3">
       <Skeleton class="w-16 h-3 rounded-sm opacity-20" />
    </TableCell>
    <TableCell class="py-3">
       <div class="flex items-center gap-1.5">
          <Skeleton class="w-12 h-4 rounded-full opacity-20" />
          <Skeleton class="w-14 h-4 rounded-full opacity-20" />
       </div>
    </TableCell>
    <TableCell class="py-3 text-right">
       <Skeleton class="w-12 h-3 ml-auto rounded-sm opacity-20" />
    </TableCell>
    <TableCell class="py-3 text-right">
       <Skeleton class="w-12 h-3 ml-auto rounded-sm opacity-20" />
    </TableCell>
    <TableCell class="py-3 text-right">
       <div class="flex items-center justify-end gap-1.5">
          <Skeleton class="w-3 h-3 rounded-full opacity-20" />
          <Skeleton class="w-16 h-3 rounded-sm opacity-20" />
       </div>
    </TableCell>
    <TableCell class="py-3 text-right">
       <Skeleton class="w-14 h-3 ml-auto rounded-sm opacity-20" />
    </TableCell>
    <TableCell class="py-3 text-right">
       <Skeleton class="w-14 h-3 ml-auto rounded-sm opacity-20" />
    </TableCell>
  </TableRow>
</template>

