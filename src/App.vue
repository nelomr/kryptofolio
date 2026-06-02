<script setup lang="ts">
/**
 * App — Component description.
 */

import { onMounted, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import { Toaster } from "@/components/ui/sonner";
import { errorBus } from "@/core/infrastructure/errors/errorBus";
import type { ValidationErrorPayload } from "@/core/infrastructure/errors/errorBus";
import AppHeader from "@/components/layout/AppHeader.vue";
// ---------------------------------------------------------------------------
// Global error handling — listens to the errorBus and shows Sonner toasts
// when Zod safeParse fails in any adapter.
// @see openspec/specs/global-error-handling/spec.md
// ---------------------------------------------------------------------------

function handleValidationError(payload: ValidationErrorPayload) {
  toast.error("Data Validation Error", {
    description: payload.message,
    duration: 6000,
  });
}

onMounted(() => {
  errorBus.on("validation-error", handleValidationError);
});

onUnmounted(() => {
  errorBus.off("validation-error", handleValidationError);
});
</script>

<template>
  <div
    class="min-h-screen flex flex-col bg-background text-foreground font-sans selection:bg-primary/30"
  >
    <AppHeader />

    <!-- Main Content -->
    <main class="flex-1 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 w-full">
      <RouterView />
    </main>

    <!-- Global Toast Notifications (shadcn-vue Sonner) -->
    <!-- Position top-right, rich colors for error visibility -->
    <Toaster rich-colors position="top-right" />
  </div>
</template>
