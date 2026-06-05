<script setup lang="ts">
/**
 * TokenSummaryCards — Component description.
 */

import { Wallet, Coins, TrendingDown, TrendingUp } from "lucide-vue-next";
import { formatCurrency, formatNumber } from "@/composables/useFormatters";
import type { CryptoAssetEntity } from "@/core/domain/models/PortfolioEntities";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();

defineProps<{
  holding: CryptoAssetEntity;
}>();
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <!-- Balance -->
    <div class="bg-card border border-border/20 shadow-soft rounded-xl p-4 hover:shadow-card transition-all duration-300">
      <div class="flex items-center gap-2 mb-2">
        <Wallet class="w-4 h-4 text-muted-foreground" />
        <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{{ t('token.balance') }}</span>
      </div>
      <div class="text-2xl font-mono text-foreground">{{ formatNumber(holding.amount) }}</div>
    </div>

    <!-- Valor Actual -->
    <div class="bg-card border border-border/20 shadow-soft rounded-xl p-4 hover:shadow-card transition-all duration-300">
      <div class="flex items-center gap-2 mb-2">
        <Coins class="w-4 h-4 text-muted-foreground" />
        <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{{ t('token.current_value') }}</span>
      </div>
      <div class="text-2xl font-mono text-foreground">{{ formatCurrency(holding.currentValueEur) }}</div>
    </div>

    <!-- Coste de Adquisición -->
    <div class="bg-card border border-border/20 shadow-soft rounded-xl p-4 hover:shadow-card transition-all duration-300">
      <div class="flex items-center gap-2 mb-2">
        <TrendingDown class="w-4 h-4 text-muted-foreground" />
        <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{{ t('token.base_cost') }}</span>
      </div>
      <div class="text-2xl font-mono text-foreground">{{ formatCurrency(holding.costBasisEur) }}</div>
    </div>

    <!-- PnL Latente -->
    <div class="bg-card border border-border/20 shadow-soft rounded-xl p-4 relative overflow-hidden group hover:shadow-card transition-all duration-300">
      <!-- Glow effect -->
      <div 
        class="absolute inset-0 opacity-5 transition-opacity duration-500 group-hover:opacity-10"
        :class="holding.unrealizedPnlEur >= 0 ? 'bg-profit' : 'bg-loss'"
      ></div>
      
      <div class="relative z-10">
        <div class="flex items-center gap-2 mb-2">
          <TrendingUp class="w-4 h-4 text-muted-foreground" />
          <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{{ t('token.unrealized_pnl') }}</span>
        </div>
        <div 
          class="text-2xl font-mono font-bold"
          :class="holding.unrealizedPnlEur >= 0 ? 'text-profit' : 'text-loss'"
        >
          {{ formatCurrency(holding.unrealizedPnlEur) }}
        </div>
      </div>
    </div>
  </div>
</template>

