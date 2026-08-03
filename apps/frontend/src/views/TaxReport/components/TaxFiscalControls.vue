<script setup lang="ts">
/**
 * TaxFiscalControls — Fiscal parameters panel (presentational).
 *
 * Allows the user to select a fiscal year. Calculation method is locked
 * to FIFO as per AEAT compliance requirements.
 *
 * Emits:
 *   - update:selectedYear(year: number): user changed the fiscal year.
 *   - download(year: number, format: 'pdf' | 'csv'): user requested a report download.
 */

import { ref, watch } from 'vue'
import { CalendarDays, FileDown, Lock, Loader2 } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/composables/useI18n'

// ---------------------------------------------------------------------------
// Props & Emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  /** Available fiscal years to populate the selector */
  availableYears: number[]
  /** Currently selected fiscal year */
  selectedYear: number
  /** Whether a recalculation fetch is in-flight */
  isLoading?: boolean
  /** Whether a report download is in-flight */
  isDownloading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedYear', year: number): void
  (e: 'download', year: number, format: 'csv'): void
}>()

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const { t } = useI18n()
const localYear = ref<string>(String(props.selectedYear))

// Watch props to keep local state synced if parent changes it
watch(() => props.selectedYear, (newVal) => {
  if (String(newVal) !== localYear.value) {
    localYear.value = String(newVal)
  }
})

// Watch local changes and emit immediately
watch(localYear, (newVal) => {
  const numYear = Number(newVal)
  if (numYear !== props.selectedYear) {
    emit('update:selectedYear', numYear)
  }
})

const isDisabled = () => props.isLoading || props.isDownloading

function handleDownload(format: 'csv') {
  emit('download', Number(localYear.value), format)
}

// Download button definitions
const downloadFormats = [
  { format: 'csv', label: t('tax.audit.download_csv') },
] as const
</script>

<template>
  <Card class="border-border/60 bg-card/80 backdrop-blur-sm shadow-sm">
    <CardHeader class="pb-3">
      <div class="flex items-center gap-2">
        <span class="flex items-center justify-center rounded border border-primary/20 bg-primary/10 p-1">
          <CalendarDays class="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <div class="flex-1">
          <CardTitle class="text-xs font-black uppercase tracking-widest text-foreground">
            {{ t('tax.audit.controls_title') }}
          </CardTitle>
          <CardDescription class="mt-0.5 text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">
            {{ t('tax.audit.controls_desc') }}
          </CardDescription>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-6">

        <!-- Fiscal Year Selector -->
        <div class="flex flex-col gap-1.5 relative">
          <label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {{ t('tax.audit.fiscal_year') }}
          </label>
          <Select v-model="localYear" :disabled="isDisabled()">
            <SelectTrigger class="w-36" :aria-label="t('tax.audit.fiscal_year')">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="year in availableYears" :key="year" :value="String(year)">
                {{ year }}
              </SelectItem>
            </SelectContent>
          </Select>
          <!-- Loading indicator for the reactive select -->
          <div v-if="isLoading" class="absolute -right-6 top-[28px]">
             <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>

        <!-- Calculation Method — locked to FIFO (AEAT compliance) -->
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {{ t('tax.audit.method') }}
          </label>
          <Badge
            class="w-fit gap-1.5 border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary"
            :title="t('tax.audit.method_fifo')"
          >
            <Lock class="h-2.5 w-2.5" />
            FIFO
          </Badge>
        </div>

        <div class="flex-1" />

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Download PDF / CSV -->
          <Button
            v-for="{ format, label } in downloadFormats"
            :key="format"
            variant="outline"
            size="sm"
            class="border-border/60 text-muted-foreground hover:text-foreground"
            :disabled="isDisabled()"
            @click="handleDownload(format)"
          >
            <FileDown :class="['mr-1.5 h-3.5 w-3.5', isDownloading && 'animate-pulse']" />
            {{ isDownloading ? t('tax.audit.downloading') : t('tax.audit.download_report') }}
            <span class="ml-1 rounded border border-border/60 px-1 py-0.5 text-[9px] font-black uppercase">
              {{ label }}
            </span>
          </Button>
        </div>

      </div>
    </CardContent>
  </Card>
</template>
