import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import ExpandedLotsTable from '../table/ExpandedLotsTable.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type { TaxLotEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import type { LotId } from '@/core/domain/models/BrandedTypes'

// <script setup> components don't expose their internal bindings on the public
// InstanceType unless defineExpose is used; Vue Test Utils still surfaces them on
// `.vm` in dev builds. This describes exactly the bindings these tests read.
interface ExpandedLotsTableTestInstance {
  expandedLots: Set<string>
  toggleLotHistory: (lotId: string) => void
  getLotHistory: (lotId: string) => TaxLotHistoryEvent[]
}

// Mock useVirtualizer to avoid complex DOM calculations in jsdom
vi.mock('@tanstack/vue-virtual', () => {
  return {
    useVirtualizer: () => ({
      value: {
        getVirtualItems: () => [
          { index: 0, start: 0, end: 64, size: 64, key: '0' },
          { index: 1, start: 64, end: 128, size: 64, key: '1' }
        ],
        getTotalSize: () => 128
      }
    })
  }
})

vi.mock('@/components/ui/skeleton/Skeleton.vue', () => ({ default: { template: '<div></div>' } }))
vi.mock('@/components/common/CryptoIcon', () => ({ CryptoIcon: { template: '<div></div>' } }))
vi.mock('@/composables/useFormatters', () => ({
  formatCurrency: (val: number) => `€${val.toFixed(2)}`,
  formatPercent: (val: number) => `${val.toFixed(2)}%`,
  formatDate: () => '01 Jan 2024'
}))
vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

describe('ExpandedLotsTable.vue', () => {
  const mockLots: TaxLotEntity[] = [
    {
      id: 'lot1' as LotId,
      date: new Date(1672531200 * 1000),
      originalQty: 1.0,
      remainingQty: 1.0,
      unitCost: 30000,
      totalCost: 30000,
      exchange: 'Kraken',
      symbol: 'BTC',
      status: 'OPEN',
      currentLocations: []
    },
    {
      id: 'lot2' as LotId,
      date: new Date(1675209600 * 1000),
      originalQty: 0.5,
      remainingQty: 0.5,
      unitCost: 32000,
      totalCost: 16000,
      exchange: 'Kraken',
      symbol: 'BTC',
      status: 'PARTIAL',
      currentLocations: []
    }
  ]

  const mockTokenHistory: Record<string, TaxLotHistoryEvent[]> = {
    lot1: [
      {
        id: 'event1',
        disposalDate: new Date(1680000000 * 1000),
        isTaxable: true,
        amountFromLot: 0.2,
        salePriceEur: 8000,
        gainLossEur: 2000,
        disposalType: 'SELL'
      }
    ]
  }

  let wrapper: VueWrapper<InstanceType<typeof ExpandedLotsTable>>

  beforeEach(() => {
    wrapper = mount(ExpandedLotsTable, {
      props: {
        assetSymbol: 'BTC',
        assetAmount: 1.5,
        assetCurrentValueEur: 90000,
        lots: mockLots,
        tokenHistory: mockTokenHistory,
        isLoadingDetails: false
      },
      global: {
        provide: {
          [I18N_PORT_KEY as symbol]: {
            translate: (key: string) => key,
            setLanguage: vi.fn(),
            getCurrentLanguage: vi.fn().mockReturnValue('en')
          }
        }
      }
    })
  })

  it('renders Level 2 holding summary rows correctly', () => {
    expect(wrapper.exists()).toBe(true)
    const rows = wrapper.findAll('tr')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('handles Level 3 expansion state (expandedLots)', async () => {
    const vm = wrapper.vm as unknown as ExpandedLotsTableTestInstance

    expect(vm.expandedLots.has('lot1')).toBe(false)
    vm.toggleLotHistory('lot1')
    expect(vm.expandedLots.has('lot1')).toBe(true)
    vm.toggleLotHistory('lot1')
    expect(vm.expandedLots.has('lot1')).toBe(false)
  })

  it('correctly maps token history', () => {
    const vm = wrapper.vm as unknown as ExpandedLotsTableTestInstance
    const history = vm.getLotHistory('lot1')

    expect(history).toHaveLength(1)
    expect(history[0].gainLossEur).toBe(2000)
  })

  it('renders the status it was given rather than one derived from quantities', () => {
    // Both lots have their full quantity remaining; the retired local derivation called that 'FULL'
    // and labelled it sold.
    const badges = wrapper.findAll('[data-testid="lot-status-badge"]')

    expect(badges.map((b) => b.text())).toEqual(['lot_status.open', 'lot_status.partial'])
  })
})
