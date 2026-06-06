<script setup lang="ts">
/**
 * YearFilter — A reusable year selector with an "All" (Todos) option.
 *
 * Used for local filtering in the operations ledgers, unlike TaxFiscalControls
 * which dictates the global fiscal year.
 */

import { computed } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/composables/useI18n";

const props = defineProps<{
  availableYears: number[];
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const { t } = useI18n();

const localValue = computed({
  get: () => props.modelValue ?? "all",
  set: (val) => emit("update:modelValue", val === "all" ? null : val),
});
</script>

<template>
  <div class="flex items-center gap-2">
    <label class="text-xs font-medium text-muted-foreground">
      {{ t("tax.filters.year") }}
    </label>
    <Select v-model="localValue">
      <SelectTrigger class="w-32 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {{ t("tax.filters.all") }}
        </SelectItem>
        <SelectItem
          v-for="year in availableYears"
          :key="year"
          :value="String(year)"
        >
          {{ year }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
