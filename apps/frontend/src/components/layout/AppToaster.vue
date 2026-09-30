<script setup lang="ts">
import { computed } from "vue";
import { Toaster } from "@/components/ui/sonner";
import { useAdvisorPanel } from "@/composables/useAdvisorPanel";

const { isOpen: advisorOpen } = useAdvisorPanel();

// The advisor sheet's header strip is 3.5rem tall and its close and new-conversation buttons sit in the
// top-right corner, exactly where toasts stack. While the sheet is open the region starts just below it.
const offset = computed(() => (advisorOpen.value ? { top: "4.5rem" } : undefined));
</script>

<template>
  <Toaster position="top-right" :close-button="true" :offset="offset" />
</template>
