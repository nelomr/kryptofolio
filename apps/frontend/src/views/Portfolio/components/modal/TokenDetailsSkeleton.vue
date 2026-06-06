<script setup lang="ts">
/**
 * TokenDetailsSkeleton — Component description.
 */

import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="px-6 py-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-8">
    <!-- Mocking TokenSummaryCards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="`card-${i}`" class="bg-card border border-border/20 shadow-soft rounded-xl p-4">
        <Skeleton class="h-4 w-20 mb-2 opacity-30" />
        <Skeleton class="h-8 w-24 opacity-30" />
      </div>
    </div>

    <!-- Mocking TokenActiveLots -->
    <section>
      <div class="flex items-center gap-2 mb-4">
         <Skeleton class="w-2 h-2 rounded-full opacity-30" />
         <Skeleton class="h-5 w-56 opacity-30" />
      </div>
      <div class="overflow-hidden rounded-lg border border-border/20 bg-card">
        <table class="w-full">
          <thead class="bg-card border-b border-border/20">
            <tr>
              <th v-for="j in 5" :key="`th1-${j}`" class="px-4 py-3"><Skeleton class="h-3 w-20 opacity-30" /></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/10">
            <tr v-for="k in 3" :key="`tr1-${k}`">
              <td class="px-4 py-3"><Skeleton class="h-4 w-24 opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 mx-auto opacity-20" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Mocking TokenSalesHistory -->
    <section>
      <div class="flex items-center gap-2 mb-4">
         <Skeleton class="w-2 h-2 rounded-full opacity-30" />
         <Skeleton class="h-5 w-48 opacity-30" />
      </div>
      <div class="overflow-hidden rounded-lg border border-border/20 bg-card">
        <table class="w-full">
          <thead class="bg-card border-b border-border/20">
            <tr>
              <th v-for="j in 6" :key="`th2-${j}`" class="px-4 py-3"><Skeleton class="h-3 w-16 opacity-30" /></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/10">
            <tr v-for="k in 2" :key="`tr2-${k}`">
              <td class="px-4 py-3"><Skeleton class="h-4 w-20 opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20 mx-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16 ml-auto opacity-20" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

