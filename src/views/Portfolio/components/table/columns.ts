import { h } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { formatCurrency } from '@/composables/useFormatters'
import type { CellContext } from '@tanstack/vue-table'
import type { CryptoAssetEntity } from '@/core/domain/models/PortfolioEntities'

import AssetCell from './cells/AssetCell.vue'
import PerformanceCell from './cells/PerformanceCell.vue'
import LocationsCell from './cells/LocationsCell.vue'

export const createColumns = (
  onExpand: (symbol: string) => void, 
  isLoading: boolean,
  t: (key: string) => string
) => [
  {
    id: 'expander',
    header: () => null,
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => {
      return h('button', {
        onClick: (e: Event) => {
          e.stopPropagation()
          row.toggleExpanded()
        },
        class: "p-2 hover:bg-muted/50 rounded-md transition-colors w-full h-full flex justify-center items-center group"
      }, [
        row.getIsExpanded() 
          ? h(ChevronDown, { class: "w-4 h-4 text-primary" })
          : h(ChevronRight, { class: "w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" })
      ])
    },
    size: 48,
  },
  {
    accessorKey: 'symbol',
    header: t('table.asset'),
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => h(AssetCell, { 
      symbol: row.original.symbol, 
      onExpand 
    }),
    size: 200,
  },
  {
    id: 'balance',
    header: () => h('div', { class: "text-right" }, t('table.balance')),
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => {
       const amount = row.original.amount || 0
       return h('div', { class: "text-right font-mono font-bold text-xs" }, amount.toFixed(4))
    }
  },
  {
    id: 'avg_cost',
    header: () => h('div', { class: "text-right" }, t('table.avg_cost')),
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => {
       const cost = formatCurrency(row.original.avgPriceEur || row.original.costBasisEur || 0)
       return h('div', { class: "text-right font-mono text-muted-foreground text-xs tabular-nums" }, cost)
    }
  },
  {
    accessorKey: 'currentValueEur',
    header: () => h('div', { class: "text-right" }, t('table.market_value')),
    cell: ({ getValue }: CellContext<CryptoAssetEntity, unknown>) => {
        const val = getValue() || 0
        return h('div', { class: "text-right font-mono font-black text-sm tracking-tighter tabular-nums" }, formatCurrency(val))
    },
  },
  {
    id: 'performance',
    header: () => h('div', { class: "text-right" }, t('table.performance')),
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => h(PerformanceCell, { row: row.original })
  },
  {
    id: 'locations',
    header: () => h('div', { class: "text-right" }, t('table.locations')),
    cell: ({ row }: CellContext<CryptoAssetEntity, unknown>) => h(LocationsCell, { row: row.original, isLoading })
  }
]
