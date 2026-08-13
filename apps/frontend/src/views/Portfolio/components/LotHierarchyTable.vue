<script setup lang="ts">
/**
 * LotHierarchyTable — Component description.
 */

import { ref, computed } from "vue";
import {
  useVueTable,
  getCoreRowModel,
  getExpandedRowModel,
  FlexRender,
} from "@tanstack/vue-table";
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TableSkeleton from "./table/TableSkeleton.vue";
import ExpandedLotsTable from "./table/ExpandedLotsTable.vue";
import { createColumns } from "./table/columns";
import type { HoldingEntity } from "@/core/domain/models/PortfolioEntities";
import type {
  LotRelocationEntity,
  TaxLotEntity,
  TaxLotHistoryEvent,
} from "@/core/domain/models/FiscalEntities";
import { useI18n } from '@/composables/useI18n';

/** Per-symbol lot detail, fetched lazily as Level 1 rows are expanded. */
interface HoldingDetails {
  lots?: TaxLotEntity[];
  history?: Record<string, TaxLotHistoryEvent[]>;
  relocations?: Record<string, LotRelocationEntity[]>;
  isLoading?: boolean;
}

const props = defineProps<{
  data: HoldingEntity[];
  isLoading?: boolean;
  /** Present when the holdings read failed — a distinct state from an empty portfolio. */
  loadError?: Error | null;
  onExpand?: (symbol: string) => void;
  detailsMap?: Record<string, HoldingDetails | undefined>;
}>();

const emit = defineEmits(['expandRow']);

const expanded = ref({});

const { t } = useI18n();

const columns = createColumns(props.onExpand || (() => {}), props.isLoading, t);

const table = useVueTable({
  get data() {
    return props.data;
  },
  columns,
  state: {
    get expanded() {
      return expanded.value;
    },
  },
  onExpandedChange: (updater) => {
    const oldExpanded = { ...expanded.value } as Record<string, boolean>;
    expanded.value =
      typeof updater === "function" ? updater(expanded.value) : updater;
    
    // Check which row became expanded
    const newExpanded = expanded.value as Record<string, boolean>;
    for (const rowId in newExpanded) {
      if (newExpanded[rowId] && !oldExpanded[rowId]) {
        const row = table.getRow(rowId);
        if (row && row.original.symbol) {
          emit('expandRow', row.original.symbol);
        }
      }
    }
  },
  getRowCanExpand: () => true,
  getCoreRowModel: getCoreRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
});

// Virtualization Setup
const parentRef = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 64, // Approximate height of a closed row
    overscan: 10,
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());
</script>

<template>
  <div
    class="w-full h-full border border-border/40 rounded-2xl bg-card overflow-auto custom-scrollbar"
    ref="parentRef"
  >
    <Table>
      <TableHeader
        class="sticky top-0 bg-background z-20 shadow-sm"
      >
        <TableRow
          v-for="headerGroup in table.getHeaderGroups()"
          :key="headerGroup.id"
          class="hover:bg-transparent border-b border-border/10"
        >
          <TableHead
            v-for="header in headerGroup.headers"
            :key="header.id"
            :style="{
              width:
                header.getSize() !== 150 ? `${header.getSize()}px` : 'auto',
            }"
            class="text-[10px] font-black uppercase tracking-widest py-4 bg-transparent"
          >
            <FlexRender
              v-if="!header.isPlaceholder"
              :render="header.column.columnDef.header"
              :props="header.getContext()"
            />
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <template v-if="isLoading">
          <TableSkeleton :count="5" />
        </template>

        <!--
          A failed load is not an empty portfolio. Collapsing the two told a user with a broken
          backend that he owned nothing, which is the one reading he must never be given.
        -->
        <template v-else-if="props.loadError">
          <TableRow>
            <TableCell
              :colspan="columns.length"
              data-testid="holdings-load-error"
              class="h-64 text-center text-warning uppercase tracking-widest text-[10px] font-black"
            >
              {{ t('portfolio.load_failed') }}
            </TableCell>
          </TableRow>
        </template>

        <template v-else-if="table.getRowModel().rows.length === 0">
          <TableRow>
            <TableCell
              :colspan="columns.length"
              class="h-64 text-center text-muted-foreground uppercase tracking-widest text-[10px] font-black"
            >
              {{ t('portfolio.no_assets') }}
            </TableCell>
          </TableRow>
        </template>

        <template v-else>
          <template v-if="virtualRows.length > 0">
            <tr :style="{ height: `${virtualRows[0].start}px` }"></tr>

            <template v-for="virtualRow in virtualRows" :key="virtualRow.key">
              <template v-if="table.getRowModel().rows[virtualRow.index]">
                <!-- Main Row (Level 1) -->
                <TableRow
                  class="group select-none border-b border-border/5"
                  :data-state="
                    table.getRowModel().rows[virtualRow.index].getIsExpanded()
                      ? 'expanded'
                      : undefined
                  "
                >
                  <TableCell
                    v-for="cell in table
                      .getRowModel()
                      .rows[virtualRow.index].getVisibleCells()"
                    :key="cell.id"
                    class="py-1"
                  >
                    <FlexRender
                      :render="cell.column.columnDef.cell"
                      :props="cell.getContext()"
                    />
                  </TableCell>
                </TableRow>

                <!-- Expanded Lots Content (Level 2) -->
                <TableRow
                  v-if="
                    table.getRowModel().rows[virtualRow.index].getIsExpanded()
                  "
                  class="border-b border-border/10"
                >
                  <TableCell :colspan="columns.length" class="p-0">
                    <ExpandedLotsTable
                      :assetSymbol="
                        table.getRowModel().rows[virtualRow.index].original
                          .symbol
                      "
                      :assetAmount="
                        table.getRowModel().rows[virtualRow.index].original
                          .amount ?? 0
                      "
                      :assetCurrentValueEur="
                        table.getRowModel().rows[virtualRow.index].original
                          .currentValueFiat ?? 0
                      "
                      :lots="props.detailsMap?.[table.getRowModel().rows[virtualRow.index].original.symbol]?.lots"
                      :tokenHistory="props.detailsMap?.[table.getRowModel().rows[virtualRow.index].original.symbol]?.history"
                      :tokenRelocations="props.detailsMap?.[table.getRowModel().rows[virtualRow.index].original.symbol]?.relocations"
                      :isLoadingDetails="props.detailsMap?.[table.getRowModel().rows[virtualRow.index].original.symbol]?.isLoading"
                    />
                  </TableCell>
                </TableRow>
              </template>
            </template>

            <tr
              :style="{
                height: `${totalSize - virtualRows[virtualRows.length - 1].end}px`,
              }"
            ></tr>
          </template>
        </template>
      </TableBody>
    </Table>
  </div>
</template>


<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--border));
  border-radius: 10px;
}
</style>
