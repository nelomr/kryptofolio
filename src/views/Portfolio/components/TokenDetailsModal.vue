<script setup lang="ts">
/**
 * TokenDetailsModal — Component description.
 */

import TokenDetailsBackdrop from "./modal/TokenDetailsBackdrop.vue";
import TokenDetailsHeader from "./modal/TokenDetailsHeader.vue";
import TokenDetailsContent from "./modal/TokenDetailsContent.vue";
import type { CryptoAssetEntity } from "@/core/domain/models/PortfolioEntities";
import type { TaxLotEntity, TaxLotHistoryEvent } from "@/core/domain/models/FiscalEntities";

const props = defineProps<{
  symbol: string;
  holding?: CryptoAssetEntity | null;
  lots?: TaxLotEntity[];
  history?: Record<string, TaxLotHistoryEvent[]>;
  loading?: boolean;
  isOpen?: boolean;
}>();

defineEmits(["close"]);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        id="token-details-modal"
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0"
      >
        <!-- Extracted Backdrop -->
        <TokenDetailsBackdrop @close="$emit('close')" />

        <span
          class="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
          >&#8203;</span
        >

        <!-- Modal Panel -->
        <div
          class="modal-panel relative z-10 inline-block align-bottom bg-background rounded-2xl text-left overflow-hidden shadow-2xl sm:my-8 sm:align-middle sm:max-w-4xl w-full border border-border"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-headline"
        >
          <!-- Extracted Header -->
          <TokenDetailsHeader :symbol="symbol" @close="$emit('close')" />

          <!-- Extracted Content -->
          <TokenDetailsContent :holding="holding" :lots="lots" :history="history" :loading="loading" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>


<style scoped>
/* Modern CSS way to lock scroll globally while modal is mounted */
:global(body:has(#token-details-modal)) {
  overflow: hidden;
}

/* Base transition for the container (opacity only) */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Specific transition for the panel (smooth transform and scale) */
.modal-enter-active .modal-panel {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active .modal-panel {
  transition: transform 0.3s cubic-bezier(0.5, 0, 0, 1);
}

.modal-enter-from .modal-panel {
  transform: scale(0.95) translateY(15px);
}

.modal-leave-to .modal-panel {
  transform: scale(0.97) translateY(5px);
}
</style>
