<script setup lang="ts">
import { ref } from 'vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, RefreshCw, Upload, Trash2 } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  wallets?: string[]
}>(), {
  wallets: () => ['All Wallets', 'Kraken', 'Bit2Me']
})

const emit = defineEmits<{
  (e: 'sync'): void
  (e: 'upload'): void
  (e: 'clear'): void
  (e: 'walletChange', wallet: string): void
}>()

const selectedWallet = ref(props.wallets[0] || 'All Wallets')

function handleWalletSelect(wallet: string) {
  selectedWallet.value = wallet
  emit('walletChange', wallet)
}
</script>

<template>
  <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
    <div class="flex items-center gap-3">
      <h1 class="text-3xl font-bold tracking-tight text-foreground">{{ t('tax.title') }}</h1>
      <Badge variant="default" class="bg-primary/20 text-primary hover:bg-primary/30">
        {{ t('tax.header.badge') }}
      </Badge>
    </div>

    <div class="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
      <!-- Wallet Selection Dropdown -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="gap-2 min-w-[140px] justify-between cursor-pointer">
            {{ selectedWallet }}
            <ChevronDown class="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            v-for="wallet in wallets"
            :key="wallet"
            class="cursor-pointer"
            @click="handleWalletSelect(wallet)"
          >
            {{ wallet }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Sync Web3 Button (Disabled) -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="inline-block">
              <Button
                variant="secondary"
                disabled
                class="gap-2"
                @click="emit('sync')"
              >
                <RefreshCw class="h-4 w-4" />
                <span class="hidden sm:inline">{{ t('tax.header.sync') }}</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ t('tax.header.pending') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Upload CSV Button (Disabled) -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="inline-block">
              <Button
                variant="secondary"
                disabled
                class="gap-2"
                @click="emit('upload')"
              >
                <Upload class="h-4 w-4" />
                <span class="hidden sm:inline">{{ t('tax.header.upload') }}</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ t('tax.header.pending') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Clear Data Button -->
      <Button
        variant="destructive"
        size="icon"
        class="cursor-pointer"
        @click="emit('clear')"
        :title="t('tax.header.delete_title')"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
    </div>
  </header>
</template>
