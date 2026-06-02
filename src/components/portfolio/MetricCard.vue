<script setup lang="ts">
/**
 * MetricCard — Component description.
 */

defineProps<{
  label: string
  /** Tailwind color class for the bottom glow line (via color, e.g. 'via-primary/20') */
  glowColor?: string
}>()
</script>

<template>
  <div
    class="relative overflow-hidden rounded-lg border bg-card/20 backdrop-blur-2xl border-border/40 shadow-alucard-card group transition-all duration-700"
    :class="glowColor ? `hover:border-${glowColor.replace('via-', '').replace('/20', '')}/20` : 'hover:border-primary/20'"
  >
    <!-- Bottom glow line -->
    <div
      class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"
      :class="glowColor ?? 'via-primary/20'"
    />

    <!-- Content -->
    <div class="p-4 lg:p-6 flex flex-col justify-between h-24 lg:h-32 relative z-10">
      <p class="text-[10px] lg:text-[11px] uppercase font-black text-muted-foreground tracking-[0.2em] mb-1">
        {{ label }}
      </p>
      <slot />
    </div>
  </div>
</template>
