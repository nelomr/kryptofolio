<script setup lang="ts">
/**
 * ChartsRowSkeleton — Component description.
 */

import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 lg:min-h-[300px]">
    <!-- Performance Line Chart Skeleton — 2/3 width -->
    <div class="lg:col-span-2 min-h-[250px] lg:min-h-0 relative rounded-lg border border-border/40 overflow-hidden bg-card/10">
      <Skeleton class="absolute inset-0 bg-muted/5 opacity-50" />
      <div class="absolute inset-x-6 top-6 bottom-6 flex flex-col justify-between">
        <Skeleton class="w-32 h-4 rounded-md opacity-30" />
        <div class="w-full flex-1 mt-4 relative">
          <Skeleton class="absolute bottom-0 w-full h-[60%] rounded-t-xl opacity-20" />
        </div>
      </div>
    </div>

    <!-- Asset Allocation Doughnut Chart Skeleton — 1/3 width -->
    <div class="min-h-[250px] lg:min-h-0 relative rounded-lg border border-border/40 overflow-hidden bg-card/10 flex items-center justify-center">
      <Skeleton class="absolute inset-0 bg-muted/5 opacity-50" />
      <Skeleton class="w-40 h-40 rounded-full opacity-20" />
      <Skeleton class="absolute w-28 h-28 rounded-full bg-card/10 border border-border/40" />
    </div>
  </div>
</template>
