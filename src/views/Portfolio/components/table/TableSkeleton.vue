<script setup lang="ts">
/**
 * TableSkeleton — Component description.
 */

import { TableRow, TableCell } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

withDefaults(defineProps<{ count?: number }>(), { count: 5 })
</script>

<template>
  <TableRow v-for="i in count" :key="`table-skeleton-${i}`" class="border-b border-border/5">
    <TableCell><Skeleton class="w-4 h-4 rounded-sm opacity-30" /></TableCell>
    <TableCell>
      <div class="flex gap-2 items-center">
        <Skeleton class="w-8 h-8 rounded-lg opacity-30" />
        <Skeleton class="w-16 h-4 rounded-md opacity-30" />
      </div>
    </TableCell>
    <TableCell align="right"><Skeleton class="w-16 h-4 ml-auto rounded-md opacity-30" /></TableCell>
    <TableCell align="right"><Skeleton class="w-12 h-3 ml-auto rounded-md opacity-30" /></TableCell>
    <TableCell align="right"><Skeleton class="w-20 h-4 ml-auto rounded-md opacity-30" /></TableCell>
    <TableCell align="right"><Skeleton class="w-10 h-6 rounded-sm ml-auto opacity-30" /></TableCell>
    <TableCell align="right"><Skeleton class="w-12 h-4 rounded-sm ml-auto opacity-30" /></TableCell>
  </TableRow>
</template>
