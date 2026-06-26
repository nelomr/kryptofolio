<script setup lang="ts">
import { ref, computed } from "vue";
import { useCsvImportWizard } from "../composables/useCsvImportWizard";
import { useI18n } from "@/composables/useI18n";
import type { TransactionRow } from "@kryptofolio/shared-types";
import { COLUMN_DICTIONARY } from "@kryptofolio/core-domain";
import {
  FlexRender,
  getCoreRowModel,
  useVueTable,
  type RowData,
  type CellContext,
} from "@tanstack/vue-table";
import { useVirtualizer } from "@tanstack/vue-virtual";

declare module "@tanstack/vue-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    mappedTo?: string;
  }
}

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const wizard = useCsvImportWizard();
const { t } = useI18n();

const parentRef = ref<HTMLElement | null>(null);

const DOMAIN_TARGETS = computed(() => {
  return Object.keys(COLUMN_DICTIONARY)
    .map((col) => ({
      value: col,
      label: t(`ingestion.columns.${col}`),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const columns = computed(() => {
  return wizard.columnMapper.headers.value.map((header) => {
    const mappedTo = wizard.columnMapper.mapping.value[header] || undefined;

    return {
      id: header,
      accessorFn: (row: TransactionRow) => row.originalData[header],
      header: () => header,
      cell: (info: CellContext<TransactionRow, unknown>) => info.getValue(),
      meta: { mappedTo },
    };
  });
});

const table = useVueTable({
  get data() {
    return wizard.previewTable.rows.value;
  },
  get columns() {
    return columns.value;
  },
  getCoreRowModel: getCoreRowModel(),
});

const rows = computed(() => table.getRowModel().rows);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 44,
    overscan: 10,
  })),
);

const handleRemap = (originalHeader: string, targetDomainProperty: unknown) => {
  const target = String(targetDomainProperty);
  if (!target || target === "unmapped" || target === "null") {
    wizard.columnMapper.updateMapping(originalHeader, null);
  } else {
    wizard.columnMapper.updateMapping(originalHeader, target);
  }
  wizard.previewTable.generatePreview(
    wizard.fileParser.rawRows.value,
    wizard.columnMapper.mapping.value,
  );
};

const handleCellInput = (rowId: string, header: string, event: Event) => {
  const input = event.target as HTMLInputElement;
  const targetDomainProperty = wizard.columnMapper.mapping.value[header];

  if (targetDomainProperty) {
    if (targetDomainProperty === "metadata") {
      // In metadata, the field is nested
      const updatedValue = input.value;
      const row = wizard.previewTable.rows.value.find((r) => r.id === rowId);
      if (row) {
        const metadata: Record<string, string> = row.mappedData.metadata || {};
        metadata[header] = updatedValue;
        row.mappedData.metadata = metadata;
        row.originalData[header] = updatedValue;
      }
    } else {
      wizard.previewTable.updateRowField(
        rowId,
        targetDomainProperty as keyof TransactionRow["mappedData"],
        input.value,
      );
      const row = wizard.previewTable.rows.value.find((r) => r.id === rowId);
      if (row) {
        row.originalData[header] = input.value;
      }
    }
  }
};

const formatError = (error: string) => {
  const parts = error.split(": ");
  return t(parts.length > 1 ? parts.slice(1).join(": ") : error);
};
</script>

<template>
  <div
    class="h-[55vh] min-h-[300px] max-h-[500px] border border-border rounded-lg overflow-x-auto overflow-y-hidden bg-surface relative"
  >
    <div class="flex flex-col h-full w-max min-w-full">
      <div class="bg-surface-2 border-b border-border flex items-center">
        <div
          v-for="header in table.getFlatHeaders()"
          :key="header.id"
          class="flex-1 min-w-[150px] p-3 text-xs font-semibold text-muted uppercase tracking-wider border-r border-border flex flex-col gap-2"
        >
          <div class="truncate" :title="header.id">
            {{ header.id }}
          </div>

          <Select
            :model-value="header.column.columnDef.meta?.mappedTo || 'unmapped'"
            @update:model-value="(val) => handleRemap(header.id, val)"
          >
            <SelectTrigger
              class="h-8 text-xs bg-surface border-border focus:ring-brand-soft"
            >
              <SelectValue
                :placeholder="t('ingestion.grid.mapping_unmapped')"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unmapped">{{
                t("ingestion.grid.mapping_unmapped")
              }}</SelectItem>
              <SelectItem
                v-for="target in DOMAIN_TARGETS"
                :key="target.value"
                :value="target.value"
              >
                {{ target.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- ADDED SYSTEM ERRORS HEADER -->
        <div
          class="flex-1 min-w-[150px] p-3 text-xs font-semibold text-loss uppercase tracking-wider flex flex-col gap-2"
        >
          <div class="truncate">Validation Errors</div>
        </div>
        <!-- END -->
      </div>

      <div
        ref="parentRef"
        class="flex-1 overflow-y-auto overflow-x-hidden relative w-full"
      >
        <div
          :style="{ height: `${virtualizer.getTotalSize()}px` }"
          class="relative"
        >
          <div
            v-for="virtualRow in virtualizer.getVirtualItems()"
            :key="virtualRow.index"
            class="absolute top-0 left-0 w-full flex items-stretch border-b border-border-soft transition-colors"
            :class="[
              rows[virtualRow.index].original.hasError
                ? 'bg-loss-soft'
                : 'hover:bg-surface-3',
            ]"
            :style="{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <div
              v-for="cell in rows[virtualRow.index].getVisibleCells()"
              :key="cell.id"
              class="flex-1 min-w-[150px] border-r border-border-soft p-2 flex items-center"
            >
              <template v-if="cell.column.columnDef.meta?.mappedTo">
                <input
                  type="text"
                  :value="
                    cell.column.columnDef.meta!.mappedTo === 'metadata'
                      ? rows[virtualRow.index].original.mappedData.metadata?.[
                          cell.column.id
                        ] || ''
                      : (rows[virtualRow.index].original.mappedData[
                          cell.column.columnDef.meta!
                            .mappedTo as keyof TransactionRow['mappedData']
                        ] as string)
                  "
                  class="w-full bg-transparent px-2 py-1 outline-none text-sm num transition-colors rounded-sm"
                  :class="[
                    (rows[virtualRow.index].original.errors as string[]).some(
                      (e) =>
                        e.startsWith(
                          cell.column.columnDef.meta!.mappedTo + ':',
                        ),
                    )
                      ? 'border border-loss text-loss focus:ring-1 focus:ring-loss bg-surface'
                      : 'border border-transparent focus:border-border focus:bg-surface',
                  ]"
                  @input="
                    (e) =>
                      handleCellInput(
                        rows[virtualRow.index].original.id,
                        cell.column.id,
                        e,
                      )
                  "
                />
              </template>
              <template v-else>
                <div class="px-2 py-1 text-sm text-fg-2 truncate num w-full">
                  <FlexRender
                    :render="cell.column.columnDef.cell"
                    :props="cell.getContext()"
                  />
                </div>
              </template>
            </div>

            <div
              class="flex-1 min-w-[150px] p-2 flex items-center text-[11px] text-loss font-mono truncate border-border-soft bg-loss-soft/30 gap-1.5"
              :title="
                rows[virtualRow.index].original.errors
                  ?.map((e) => formatError(e))
                  .join('\n')
              "
            >
              <template v-if="rows[virtualRow.index].original.errors?.length">
                <span
                  class="i-lucide-alert-triangle shrink-0 opacity-70"
                ></span>
                <span class="truncate">
                  {{
                    rows[virtualRow.index].original.errors
                      ?.map((e) => formatError(e))
                      .join(", ")
                  }}
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
