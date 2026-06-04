<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wallet } from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import { useWalletsPort } from "../composables/useWalletsPort";

const { t } = useI18n();
const { uploadWalletCsv, isUploading } = useWalletsPort();

const walletFileInput = ref<HTMLInputElement | null>(null);

function handleWalletFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    uploadWalletCsv(file);
  }
  // Reset input
  if (walletFileInput.value) {
    walletFileInput.value.value = "";
  }
}
</script>

<template>
  <div class="inline-block">
    <input
      type="file"
      ref="walletFileInput"
      accept=".csv"
      class="hidden"
      @change="handleWalletFileChange"
    />
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="outline"
            class="gap-2 cursor-pointer text-blue-600 border-blue-600/20 hover:bg-blue-400/10 hover:text-blue-300 transition-colors duration-300 shadow-sm"
            :disabled="isUploading"
            @click="walletFileInput?.click()"
          >
            <Wallet class="h-4 w-4" />
            <span class="hidden sm:inline">{{ t("tax.wallets.upload") }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          class="max-w-xs text-sm p-3 border-blue-400/20 bg-background/95 backdrop-blur shadow-lg"
        >
          <p
            class="font-bold mb-2 border-b border-blue-400/20 pb-1 text-blue-400"
          >
            {{ t("tax.wallets.tooltip_title") }}
          </p>
          <ul class="list-disc pl-4 space-y-1 text-black">
            <li>
              <strong class="text-blue-500">wallet_name</strong>: (e.g., "My
              Ledger")
            </li>
            <li>
              <strong class="text-blue-500">wallet_type</strong>: (HOT_WALLET |
              COLD_WALLET)
            </li>
            <li>
              <strong class="text-blue-500">blockchain</strong>: (e.g.,
              "Ethereum")
            </li>
            <li><strong class="text-blue-500">address</strong>: (0x...)</li>
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
