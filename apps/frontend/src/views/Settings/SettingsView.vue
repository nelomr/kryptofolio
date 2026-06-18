<script setup lang="ts">
import { computed } from 'vue';
import VaultSettings from './components/VaultSettings.vue';
import LanguageSettings from './components/LanguageSettings.vue';
import { useMarketDataFeed } from '@/composables/queries/useMarketDataFeed';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// Connect to the SSE stream to determine connection status for the UI
const { latestPrices } = useMarketDataFeed();

// SSE is considered connected if we have at least one price in the map
const isSseConnected = computed(() => latestPrices.value.size > 0);
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ t('settings.title') }}</h1>
      <p class="text-muted-foreground mt-2">
        {{ t('settings.description') }}
      </p>
    </div>

    <LanguageSettings />
    <VaultSettings />
  </div>
</template>
