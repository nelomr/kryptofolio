<script setup lang="ts">
import { Card } from '@/components/ui/card'

defineProps<{
  label: string
  topValue?: string
  topValueClass?: string
  mainValue: string
  mainValueClass?: string
  deltaValue?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  deltaDesc?: string
  subLabel?: string
  subValue?: string
  subValueClass?: string
}>()
</script>

<template>
  <Card class="flex flex-col gap-2 p-6 rounded-3xl shadow-sm min-w-[240px]">
    <!-- Header -->
    <div class="flex justify-between items-start gap-4">
      <span class="text-[11px] font-mono font-medium tracking-[0.18em] uppercase text-muted">{{ label }}</span>
      <span v-if="topValue" class="text-[11px] font-mono font-medium tracking-[0.18em] uppercase" :class="topValueClass">
        {{ topValue }}
      </span>
    </div>
    
    <!-- Body -->
    <div class="flex-1 mt-1">
      <p class="text-[32px] font-bold font-mono tracking-tight leading-none num" :class="mainValueClass">
        {{ mainValue }}
      </p>
      
      <p v-if="deltaValue" class="flex items-center gap-1.5 text-xs font-medium font-mono mt-2" 
         :class="deltaDirection === 'up' ? 'text-profit' : deltaDirection === 'down' ? 'text-loss' : 'text-muted'">
        <span class="text-[10px]">{{ deltaDirection === 'up' ? '▲' : deltaDirection === 'down' ? '▼' : '▬' }}</span>
        <span class="num">{{ deltaValue }}</span>
        <span class="font-sans font-normal text-muted ml-1">{{ deltaDesc }}</span>
      </p>
      
      <!-- Sparkline Placeholder (can be overridden via slot) -->
      <slot name="sparkline">
        <svg class="w-full h-9 mt-2" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
           <path v-if="deltaDirection === 'up'" d="M0,28 C15,25 30,22 45,20 C60,15 75,12 90,5 L100,2" fill="none" stroke="currentColor" class="text-profit" stroke-width="1.5"/>
           <path v-else-if="deltaDirection === 'down'" d="M0,8 C15,12 30,18 45,22 C60,26 75,28 90,30 L100,32" fill="none" stroke="currentColor" class="text-loss" stroke-width="1.5"/>
           <path v-else d="M0,18 C20,16 40,19 60,18 C80,17 90,18 100,18" fill="none" stroke="currentColor" class="text-accent" stroke-width="1.5"/>
        </svg>
      </slot>
    </div>

    <!-- Footer Row -->
    <div v-if="subLabel" class="flex justify-between items-center gap-2 pt-2.5 mt-1 border-t border-border/50">
      <span class="text-[11px] font-mono font-medium tracking-[0.18em] uppercase text-muted">{{ subLabel }}</span>
      <span class="text-[12px] font-mono font-semibold num" :class="subValueClass">{{ subValue }}</span>
    </div>
  </Card>
</template>
