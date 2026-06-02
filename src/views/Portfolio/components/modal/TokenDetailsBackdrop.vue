<script setup lang="ts">
/**
 * TokenDetailsBackdrop — Component description.
 */

defineEmits(['close'])
</script>

<template>
  <div
    class="fixed inset-0 transition-opacity"
    aria-hidden="true"
    @click="$emit('close')"
  >
    <div class="absolute inset-0 bg-background/80 backdrop-blur-sm"></div>
  </div>
</template>

