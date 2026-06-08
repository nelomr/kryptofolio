<script setup lang="ts">
import { useI18n } from "@/composables/useI18n";
import WalletSelector from "./WalletSelector.vue";
import WalletUploader from "./WalletUploader.vue";
import TaxReportActions from "./TaxReportActions.vue";

const { t } = useI18n();

const emit = defineEmits<{
  (e: "sync"): void;
  (e: "upload"): void;
  (e: "walletChange", wallet: string): void;
}>();
</script>

<template>
  <header
    class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6"
  >
    <div class="flex items-center gap-3">
      <h1 class="text-3xl font-bold tracking-tight text-foreground">
        {{ t("tax.title") }}
      </h1>
    </div>

    <div
      class="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0"
    >
      <WalletSelector @wallet-change="(w) => emit('walletChange', w)" />
      <WalletUploader />
      <TaxReportActions
        @sync="emit('sync')"
        @upload="emit('upload')"
      />
    </div>
  </header>
</template>
