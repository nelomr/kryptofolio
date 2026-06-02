<script setup lang="ts">
/**
 * TaxOperationsBar — Operations toolbar for the Tax domain.
 *
 * @see src/composables/queries/useTaxMutations.ts
 */

import { ref, computed } from "vue";
import {
  Link,
  Upload,
  Trash2,
  RefreshCw,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/composables/useI18n";
import {
  useUploadTaxFileMutation,
  useImportWalletMutation,
  useDeleteTransactionsMutation,
} from "@/composables/queries/useTaxMutations";

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Mutations (from Pinia Colada — API-first, automatic cache invalidation)
// ---------------------------------------------------------------------------

const { mutateAsync: uploadFile, isLoading: isUploading } =
  useUploadTaxFileMutation();
const { mutateAsync: importWallet, isLoading: isImporting } =
  useImportWalletMutation();
const { mutateAsync: deleteAll, isLoading: isDeleting } =
  useDeleteTransactionsMutation();

// ---------------------------------------------------------------------------
// Local state for inputs (not stored in Pinia — ephemeral UI state)
// ---------------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null);
const selectedChain = ref<"hedera" | "solana" | "ethereum">("hedera");
const walletAddress = ref("");

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await uploadFile(file);
  // Reset input so same file can be re-selected
  if (fileInput.value) fileInput.value.value = "";
}

async function handleImport() {
  if (!walletAddress.value.trim()) return;
  await importWallet({
    chain: selectedChain.value,
    address: walletAddress.value.trim(),
  });
  walletAddress.value = "";
}

async function handleDeleteAll() {
  if (!confirm(t("tax.delete.confirm"))) return;
  await deleteAll();
}

const isAnyLoading = computed(
  () => isUploading.value || isImporting.value || isDeleting.value,
);
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
  >
    <div class="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
      <!-- Section 1: CSV / XLSX Upload (adapted from legacy upload section) -->
      <div
        class="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3"
      >
        <div class="flex flex-col gap-0.5">
          <h3
            class="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1.5"
          >
            <span class="rounded border border-primary/20 bg-primary/10 p-1">
              <Upload class="h-3 w-3" />
            </span>
            {{ t("tax.upload.title") }}
          </h3>
          <p
            class="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground"
          >
            {{ t("tax.upload.subtitle") }}
          </p>
        </div>

        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.xlsx"
          class="hidden"
          :disabled="isAnyLoading"
          @change="handleFileChange"
        />
        <Button
          variant="default"
          size="sm"
          class="shrink-0"
          :disabled="isAnyLoading"
          @click="fileInput?.click()"
        >
          <RefreshCw v-if="isUploading" class="mr-1.5 h-3 w-3 animate-spin" />
          <Upload v-else class="mr-1.5 h-3 w-3" />
          {{ isUploading ? t("tax.upload.uploading") : t("tax.upload.btn") }}
        </Button>
      </div>

      <!-- Separator -->
      <div class="hidden h-10 w-px bg-border lg:block" />

      <!-- Section 2: Blockchain Import (adapted from BlockchainImportPanel.vue) -->
      <div
        class="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3"
      >
        <div class="flex flex-col gap-0.5">
          <h3
            class="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1.5"
          >
            <span class="rounded border border-primary/20 bg-primary/10 p-1">
              <Link class="h-3 w-3" />
            </span>
            {{ t("tax.import.title") }}
          </h3>
          <p
            class="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground"
          >
            {{ t("tax.import.subtitle") }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Chain selector -->
          <select
            v-model="selectedChain"
            class="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-all focus:border-primary/50 focus:outline-none cursor-pointer"
            :disabled="isAnyLoading"
          >
            <option value="hedera">Hedera (HBAR)</option>
            <option value="solana">Solana (SOL)</option>
            <option value="ethereum">Ethereum (ETH)</option>
          </select>

          <!-- Address input -->
          <input
            v-model="walletAddress"
            type="text"
            :placeholder="t('tax.import.address_placeholder')"
            class="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground placeholder-muted-foreground shadow-sm transition-all focus:border-primary/50 focus:outline-none w-full md:w-60"
            :disabled="isAnyLoading"
            @keyup.enter="handleImport"
          />

          <Button
            variant="default"
            size="sm"
            :disabled="isAnyLoading || !walletAddress.trim()"
            @click="handleImport"
          >
            <RefreshCw v-if="isImporting" class="mr-1.5 h-3 w-3 animate-spin" />
            {{ isImporting ? t("tax.import.importing") : t("tax.import.btn") }}
          </Button>
        </div>
      </div>

      <!-- Separator -->
      <div class="hidden h-10 w-px bg-border lg:block" />

      <!-- Section 3: Danger zone — Delete All -->
      <div class="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:bg-destructive/10 hover:text-destructive"
          :disabled="isAnyLoading"
          @click="handleDeleteAll"
        >
          <Trash2 v-if="!isDeleting" class="mr-1.5 h-3 w-3" />
          <RefreshCw v-else class="mr-1.5 h-3 w-3 animate-spin" />
          {{ t("tax.delete.btn") }}
        </Button>
      </div>
    </div>
  </div>
</template>
