<script setup lang="ts">
/**
 * AppHeader — Minimalist Institutional Terminal Top Navigation.
 */

import { useI18n } from "@/composables/useI18n";
import appLogo from "@/assets/favicon.svg";
import { PieChart, Landmark, Settings } from "lucide-vue-next";

const { t } = useI18n();
</script>

<template>
  <header
    class="sticky top-0 z-50 border-b border-border-soft bg-background/80 backdrop-blur-md"
  >
    <div class="mx-auto max-w-[1600px] px-4 md:px-6">
      <div class="flex h-14 items-center justify-between">
        <!-- Brand & Workspace Tabs -->
        <div class="flex items-center gap-4 sm:gap-6">
          <RouterLink
            to="/"
            class="flex items-center gap-2.5 transition-opacity hover:opacity-90 cursor-pointer"
          >
            <img
              :src="appLogo"
              alt="Kryptofolio"
              class="h-7 w-7 object-contain shrink-0"
            />
            <span
              class="font-sans font-semibold text-[15px] tracking-tight text-foreground"
            >
              Kryptofolio
            </span>
          </RouterLink>

          <!-- Primary Navigation Tabs -->
          <nav
            class="flex items-center gap-1 border-l border-border-soft pl-4 sm:pl-6"
          >
            <RouterLink
              to="/"
              class="flex items-center gap-2 border border-transparent px-3 py-1.5 rounded-md text-xs font-medium text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
              exact-active-class="!text-foreground !bg-surface-3 !border-border-soft/80 shadow-sm font-semibold"
            >
              <PieChart class="h-4 w-4 shrink-0" />
              <span class="hidden sm:inline">{{ t("navbar.portfolio") }}</span>
            </RouterLink>
            <RouterLink
              to="/tax"
              class="flex items-center gap-2 border border-transparent px-3 py-1.5 rounded-md text-xs font-medium text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
              active-class="!text-foreground !bg-surface-3 !border-border-soft/80 shadow-sm font-semibold"
            >
              <Landmark class="h-4 w-4 shrink-0" />
              <span class="hidden sm:inline">{{ t("tax.title") }}</span>
            </RouterLink>
          </nav>
        </div>

        <!-- Utility Action Slot -->
        <div class="flex items-center gap-2">
          <RouterLink
            to="/settings"
            class="h-8 w-8 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-2 border border-transparent hover:border-border-soft transition-colors cursor-pointer"
            active-class="!text-foreground !bg-surface-3 !border-border-soft/80 shadow-sm"
            :title="t('navbar.settings')"
            :aria-label="t('navbar.settings')"
          >
            <Settings class="h-4 w-4" />
          </RouterLink>
        </div>
      </div>
    </div>
  </header>
</template>
