<script setup lang="ts">
import VaultSettings from "@/components/settings/VaultSettings.vue";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ t('settings.title') }}</h1>
      <p class="text-muted-foreground mt-2">
        {{ t('settings.description') }}
      </p>
    </div>
    
    <VaultSettings />
  </div>
</template>
