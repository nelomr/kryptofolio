<script setup lang="ts">
/**
 * AppHeader — Component description.
 */

import { useI18n } from "@/composables/useI18n";
import CryptoIcon from "@/components/common/CryptoIcon/CryptoIcon.vue";
import { PieChart, Landmark, Settings } from "lucide-vue-next";

const { t } = useI18n();
</script>

<template>
  <header class="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
    <div class="mx-auto max-w-[1600px] px-4 md:px-6">
      <div class="flex h-22 items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="h-12 w-12 flex items-center justify-center">
            <CryptoIcon
              symbol="kryptofolio"
              :size="100"
              :colored="true"
              class="drop-shadow-md"
            />
          </div>
          <div class="flex flex-col justify-center">
            <h1 class="text-3xl font-mono font-medium text-muted tracking">
              Kryptofolio
            </h1>
            <span
              class="text-[10px] font-mono uppercase tracking-[0.2em] text-muted font-bold mt-1.5 ml-0.5"
            >
              {{ t("portfolio.subtitle") }}
            </span>
          </div>
        </div>

        <nav
          class="flex items-center gap-1.5 rounded-full bg-secondary/30 p-1.5 backdrop-blur-md border border-primary/10 shadow-inner"
        >
          <RouterLink
            to="/"
            class="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 text-muted-foreground hover:text-accent-foreground hover:bg-accent cursor-pointer"
            exact-active-class="!text-primary bg-background shadow-sm ring-1 ring-primary/20"
          >
            <PieChart class="h-4 w-4" />
            {{ t("navbar.portfolio") }}
          </RouterLink>
          <RouterLink
            to="/tax"
            class="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 text-muted-foreground hover:text-accent-foreground hover:bg-accent cursor-pointer"
            active-class="!text-primary bg-background shadow-sm ring-1 ring-primary/20"
          >
            <Landmark class="h-4 w-4" />
            {{ t("tax.title") }}
          </RouterLink>
          <RouterLink
            to="/settings"
            class="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 text-muted-foreground hover:text-accent-foreground hover:bg-accent cursor-pointer"
            active-class="!text-primary bg-background shadow-sm ring-1 ring-primary/20"
            title="Settings"
          >
            <Settings class="h-4 w-4" />
          </RouterLink>
        </nav>
      </div>
    </div>
  </header>
</template>
