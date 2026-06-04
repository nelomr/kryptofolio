<script setup lang="ts">
import { ref, watch, unref } from 'vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { useWalletsPort } from '../composables/useWalletsPort'

const emit = defineEmits<{
  (e: 'walletChange', wallet: string): void
}>()

const { t } = useI18n()
const { walletNames } = useWalletsPort()

// Default to the first wallet name (which is 'All Wallets' translated)
const selectedWallet = ref('')

watch(() => unref(walletNames), (names) => {
  if (!selectedWallet.value && names && names.length > 0) {
    selectedWallet.value = names[0]
  }
}, { immediate: true })

function handleWalletSelect(wallet: string) {
  selectedWallet.value = wallet
  emit('walletChange', wallet)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" class="gap-2 min-w-[140px] justify-between cursor-pointer">
        {{ selectedWallet || t('tax.wallets.all') }}
        <ChevronDown class="h-4 w-4 opacity-50" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="wallet in walletNames"
        :key="wallet"
        class="cursor-pointer"
        @click="handleWalletSelect(wallet)"
      >
        {{ wallet }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
