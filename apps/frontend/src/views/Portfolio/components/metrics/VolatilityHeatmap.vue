<script setup lang="ts">
import { ref } from "vue";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/composables/useI18n";
import { formatPercent } from "@/composables/useFormatters";
import { useVolatilityHeatmapQuery } from "@/composables/queries/useCryptoMetricsQueries";
import { useVolatilityGrid } from "@/composables/useVolatilityGrid";

const { t } = useI18n();

const currentYear = ref(new Date().getFullYear());
const { data, isLoading, error } = useVolatilityHeatmapQuery(currentYear);

const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];

const { heatmapCells, stats, getCellBg } = useVolatilityGrid(data);
</script>

<template>
  <Card class="flex flex-col rounded-[24px] shadow-soft">
    <CardHeader
      class="flex flex-row justify-between items-start gap-4 p-6 pb-4"
    >
      <div class="flex flex-col gap-1">
        <span
          class="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >{{ t("metrics.volatility.kicker") }}</span
        >
        <CardTitle class="text-[18px] font-semibold tracking-tight">{{
          t("metrics.volatility.title")
        }}</CardTitle>
        <p class="text-[12px] text-muted-foreground mt-0.5">
          {{ t("metrics.volatility.desc") }}
        </p>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <span
          class="font-mono text-[11px] font-semibold tracking-wider text-profit"
          >{{ stats.avg >= 0 ? "+" : "" }}{{ formatPercent(stats.avg) }}</span
        >
        <span
          class="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground"
          >{{ t('metrics.volatility.stats.daily_avg') }}</span
        >
      </div>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col p-6 pt-0">
      <div v-if="isLoading" class="flex flex-col gap-2 flex-1">
        <Skeleton class="w-full h-32" />
      </div>
      <div v-else-if="error" class="flex items-center justify-center h-32 text-muted-foreground text-sm text-center">
        {{ t('metrics.error_loading') }}
      </div>
      <div v-else class="flex-1 flex flex-col">
        <div
          class="grid gap-2 items-center"
          style="grid-template-columns: auto 1fr"
        >
          <!-- Y Axis (Days) -->
          <div class="flex flex-col gap-1">
            <span
              v-for="d in dayLabels"
              :key="d"
              class="flex items-center h-[16px] font-mono text-[10px] text-muted-foreground tracking-[0.06em]"
            >
              {{ d }}
            </span>
          </div>
          <!-- Heatmap Matrix -->
          <div>
            <div class="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
              <template
                v-for="(row, rIndex) in heatmapCells"
                :key="'row-' + rIndex"
              >
                <TooltipProvider
                  v-for="(day, cIndex) in row"
                  :key="'cell-' + rIndex + '-' + cIndex"
                >
                  <Tooltip v-if="day">
                    <TooltipTrigger asChild>
                      <div
                        class="aspect-square rounded-[3px] cursor-default"
                        :class="getCellBg(day.returnPercent)"
                      ></div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div class="flex flex-col gap-1 p-1">
                        <span class="font-semibold">{{ day.dateStr }}</span>
                        <span
                          class="font-mono text-[13px]"
                          :class="
                            day.returnPercent >= 0 ? 'text-profit' : 'text-loss'
                          "
                        >
                          {{ day.returnPercent >= 0 ? "+" : ""
                          }}{{ formatPercent(day.returnPercent) }}
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <div
                    v-else
                    class="aspect-square rounded-[3px] bg-surface-2"
                  ></div>
                </TooltipProvider>
              </template>
            </div>
            <!-- X Axis (Weeks) -->
            <div
              class="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 mt-1.5 font-mono text-[10px] text-muted-foreground tracking-[0.06em]"
            >
              <span v-for="w in 15" :key="w" class="text-center truncate">
                {{ w === 15 || w === 1 || w % 3 === 0 ? `-${16 - w}sem` : "" }}
              </span>
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div
          class="flex items-center justify-end gap-2 mt-3 font-mono text-[10px] text-muted-foreground tracking-[0.06em]"
        >
          <span>−5%</span>
          <div
            class="w-[120px] h-[8px] rounded-[4px] border border-border-soft"
            style="
              background: linear-gradient(
                90deg,
                rgba(209, 67, 67, 0.1),
                var(--surface-2),
                rgba(0, 135, 90, 0.1)
              );
            "
          ></div>
          <span>+5%</span>
        </div>
      </div>

      <!-- Footer Stats -->
      <div class="flex gap-6 pt-4 mt-4 border-t border-border-soft overflow-x-auto">
        <div class="flex flex-col gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span class="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground underline decoration-dotted underline-offset-2 cursor-default">{{ t('metrics.volatility.stats.best_day') }}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span class="text-xs max-w-[200px] block text-center font-sans normal-case tracking-normal">{{ t('metrics.volatility.stats.best_day_desc') }}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span class="font-mono text-[14px] font-semibold text-profit tracking-tight">+{{ formatPercent(stats.best) }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span class="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground underline decoration-dotted underline-offset-2 cursor-default">{{ t('metrics.volatility.stats.worst_day') }}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span class="text-xs max-w-[200px] block text-center font-sans normal-case tracking-normal">{{ t('metrics.volatility.stats.worst_day_desc') }}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span class="font-mono text-[14px] font-semibold text-loss tracking-tight">{{ formatPercent(stats.worst) }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span class="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground underline decoration-dotted underline-offset-2 cursor-default">{{ t('metrics.volatility.stats.bullish_days') }}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span class="text-xs max-w-[200px] block text-center font-sans normal-case tracking-normal">{{ t('metrics.volatility.stats.bullish_days_desc') }}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span class="font-mono text-[14px] font-semibold text-foreground tracking-tight">
            {{ stats.positiveDays }} / {{ stats.totalDays }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
