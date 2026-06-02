<script setup lang="ts">
/**
 * AppHeader — Component description.
 */

import { useI18n } from "@/composables/useI18n";
import CryptoIcon from "@/components/common/CryptoIcon/CryptoIcon.vue";

const { t } = useI18n();
const title = t('dashboard.title');
</script>

<template>
  <header class="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="h-8 w-8 flex items-center justify-center">
            <CryptoIcon symbol="kryptofolio" :size="28" :colored="true" class="drop-shadow-md" />
          </div>
          <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>
        </div>
      </div>
    </div>
  </header>
</template>
