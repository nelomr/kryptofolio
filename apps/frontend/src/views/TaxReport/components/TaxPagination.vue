<script setup lang="ts">
/**
 * TaxPagination — Pagination UI for the Tax domain.
 *
 * @see src/views/TaxReport/composables/useTaxCalculations.ts (usePagination)
 */

import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();

const props = defineProps<{
  currentPage: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  displayedPages: number[];
}>();

const emit = defineEmits<{
  (e: "page-change", page: number): void;
}>();
</script>

<template>
  <div class="flex items-center justify-between px-1 py-3">
    <!-- Mobile: prev/next only -->
    <div class="flex flex-1 justify-between sm:hidden">
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage === 1"
        @click="emit('page-change', currentPage - 1)"
      >
        {{ t("pagination.prev") }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage === totalPages"
        @click="emit('page-change', currentPage + 1)"
      >
        {{ t("pagination.next") }}
      </Button>
    </div>

    <!-- Desktop: full pagination -->
    <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
      <!-- Results info (same UX as BasePagination.vue) -->
      <p class="text-xs text-muted-foreground font-medium">
        {{ t("pagination.showing") }}
        <span class="font-semibold text-foreground">{{ rangeStart }}</span>
        {{ t("pagination.to") }}
        <span class="font-semibold text-foreground">{{ rangeEnd }}</span>
        {{ t("pagination.of") }}
        <span class="font-semibold text-foreground">{{ totalItems }}</span>
        {{ t("pagination.results") }}
      </p>

      <!-- Page number nav -->
      <nav
        class="isolate inline-flex items-center gap-1"
        :aria-label="t('pagination.aria_label')"
      >
        <!-- Prev -->
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="currentPage === 1"
          @click="emit('page-change', currentPage - 1)"
          :aria-label="t('pagination.prev')"
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>

        <!-- Page numbers (max 5, same logic as BasePagination.vue displayedPages) -->
        <Button
          v-for="page in displayedPages"
          :key="page"
          :variant="page === currentPage ? 'default' : 'outline'"
          size="icon-sm"
          @click="emit('page-change', page)"
          :aria-current="page === currentPage ? 'page' : undefined"
        >
          {{ page }}
        </Button>

        <!-- Next -->
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="currentPage === totalPages"
          @click="emit('page-change', currentPage + 1)"
          :aria-label="t('pagination.next')"
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
      </nav>
    </div>
  </div>
</template>
