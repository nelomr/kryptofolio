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
import { useI18n } from "@/composables/useI18n";
import { useInitializeLanguageQuery } from "@/composables/queries/useSettingsQueries";
import { useMarketDataFeed } from "@/composables/queries/useMarketDataFeed";

// ---------------------------------------------------------------------------
// Global error handling — listens to the errorBus and shows Sonner toasts
// when Zod safeParse fails in any adapter.
// @see openspec/specs/global-error-handling/spec.md
// ---------------------------------------------------------------------------

const { t } = useI18n();

// Initialize language from backend
useInitializeLanguageQuery();

// Initialize global market data SSE stream
useMarketDataFeed();

function handleValidationError(payload: ValidationErrorPayload) {
  const stringParams = payload.params
    ? Object.fromEntries(Object.entries(payload.params).map(([k, v]) => [k, String(v)]))
    : undefined;

  // Use a predictable ID based on the message so duplicate errors are merged/replaced
  // rather than stacking infinitely on the screen.
  const toastId = `err-${payload.message}`;

  toast.error(t("errors.validation.title") || "Data Validation Error", {
    id: toastId,
    description: t(payload.message, stringParams) || payload.message,
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
    <main class="flex-1 mx-auto max-w-[1600px] px-4 md:px-6 py-8 w-full">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <!-- Global Toast Notifications (shadcn-vue Sonner) -->
    <Toaster position="top-right" :close-button="true" />
  </div>
</template>

<style>
/* 
  Ultra-fluid page transitions mimicking native app navigation.
  Fast ease-in for leaving, and a luxurious spring-like bezier for entering.
*/
.page-enter-active {
  transition: opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease-out;
}

.page-leave-active {
  transition: opacity 0.15s ease-in, transform 0.15s ease-in, filter 0.15s ease-in;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.99);
  filter: blur(2px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.99);
  filter: blur(2px);
}
</style>
