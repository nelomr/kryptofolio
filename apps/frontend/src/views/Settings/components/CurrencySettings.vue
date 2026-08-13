<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from '@/composables/useI18n';
import { useBaseCurrencyQuery, useExchangeRateQuery } from '@/composables/queries/useSettingsQueries';
import { useUpdateBaseCurrencyMutation, useSyncExchangeRatesMutation } from '@/composables/queries/useSettingsMutations';
import type { FiatCurrency } from '@kryptofolio/core-domain';
import { CurrencyConverter, Money } from '@kryptofolio/core-domain';
import Decimal from 'decimal.js';

// UI Components (same pattern as LanguageSettings.vue)
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CoinsIcon, RefreshCwIcon } from 'lucide-vue-next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { supportedCurrencyOptions } from '../composables/useSupportedCurrencyOptions';

const { t } = useI18n();

const supportedCurrencies = supportedCurrencyOptions();

// Queries
const { data: savedBaseCurrency, isLoading: isLoadingCurrency } = useBaseCurrencyQuery();

// Local selected value (separate from saved, so user can cancel)
const selectedCurrency = ref<FiatCurrency>('USD');

watch(savedBaseCurrency, (newVal) => {
  if (newVal) {
    selectedCurrency.value = newVal;
  }
}, { immediate: true });

// Reactive exchange rate query based on the selected currency
const { data: exchangeRateRaw } = useExchangeRateQuery('USD', selectedCurrency);

// Mutation
const { mutate, isLoading: isSaving } = useUpdateBaseCurrencyMutation();
const { mutate: syncExchangeRates, isLoading: isSyncing } = useSyncExchangeRatesMutation();

const handleSave = () => {
  mutate(selectedCurrency.value);
};

const handleSync = () => {
  syncExchangeRates();
};

/**
 * Compute the exchange rate label using CurrencyConverter.formatRateLabel.
 * Falls back to a loading placeholder if rate is not yet available.
 * Uses Decimal.js internally via CurrencyConverter.
 */
const exchangeRateLabel = computed<string>(() => {
  const toCurrency = selectedCurrency.value;
  
  if (toCurrency === 'USD') return 'USD/USD = 1.0000';
  
  const exchangeData = exchangeRateRaw.value;
  if (!exchangeData || exchangeData.rate == null) return `USD/${toCurrency} = —`;
  
  const dateSuffix = exchangeData.date ? ` (${exchangeData.date})` : '';
  
  const formattedRate = CurrencyConverter.formatRateLabel({
    from: 'USD',
    to: toCurrency,
    rate: new Money(new Decimal(exchangeData.rate)),
    timestamp: new Date().toISOString(),
  });
  
  return `${formattedRate}${dateSuffix}`;
});
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center gap-2">
        <CoinsIcon class="w-5 h-5 text-muted-foreground" />
        <div class="space-y-1">
          <CardTitle>{{ t('settings.currency.title') }}</CardTitle>
          <CardDescription>{{ t('settings.currency.description') }}</CardDescription>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <!-- Exchange Rate Subtitle -->
      <p
        v-if="!isLoadingCurrency"
        class="text-xs text-muted-foreground mb-3 font-mono tracking-tight"
        aria-label="Current exchange rate"
      >
        {{ exchangeRateLabel }}
      </p>

      <div class="flex items-center gap-3">
        <!-- Currency Selector -->
        <Select
          v-model="selectedCurrency"
          :disabled="isLoadingCurrency"
        >
          <SelectTrigger class="w-[220px]" id="currency-select">
            <SelectValue :placeholder="t('settings.currency.select_placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="currency in supportedCurrencies"
              :key="currency.code"
              :value="currency.code"
            >
              {{ t(currency.labelKey) }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Save Button -->
        <Button
          id="currency-save-btn"
          :disabled="isSaving || isLoadingCurrency"
          @click="handleSave"
        >
          {{ isSaving ? t('settings.currency.saving_btn') : t('settings.currency.save_btn') }}
        </Button>

        <!-- Sync Button with Tooltip -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                id="currency-sync-btn"
                variant="outline"
                size="icon"
                :disabled="isSyncing || isLoadingCurrency || selectedCurrency === 'USD'"
                @click="handleSync"
              >
                <RefreshCwIcon class="w-4 h-4" :class="{ 'animate-spin': isSyncing }" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ t('settings.currency.sync_tooltip') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </CardContent>
  </Card>
</template>
