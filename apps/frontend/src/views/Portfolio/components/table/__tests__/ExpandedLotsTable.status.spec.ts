/**
 * The canonical status, the trustworthy-basis guard, and split custody, rendered from the payload
 * rather than re-derived from quantities.
 *
 * Every case below mounts the real component with data the backend genuinely sends, so a failure
 * describes what a user would see rather than a missing symbol.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import ExpandedLotsTable from '../ExpandedLotsTable.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type {
  LotRelocationEntity,
  TaxLotEntity,
  TaxLotHistoryEvent,
} from '@/core/domain/models/FiscalEntities'
import type { LotId, AccountId } from '@/core/domain/models/BrandedTypes'

vi.mock('@/components/ui/skeleton/Skeleton.vue', () => ({ default: { template: '<div></div>' } }))
vi.mock('@/components/common/CryptoIcon', () => ({ CryptoIcon: { template: '<div></div>' } }))
vi.mock('@/composables/useFormatters', () => ({
  formatCurrency: (val: number | null) => (val === null ? '-' : `€${val.toFixed(2)}`),
  formatPercent: (val: number) => `${val.toFixed(2)}%`,
  formatDate: () => '01 Jan 2024',
}))
vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

function lot(overrides: Partial<TaxLotEntity> = {}): TaxLotEntity {
  return {
    id: 'lot-1' as LotId,
    symbol: 'XRP',
    date: new Date('2025-12-15T00:00:00.000Z'),
    exchange: 'Kraken:spot',
    originalQty: 179.11,
    remainingQty: 179.11,
    unitCost: 1.6724,
    totalCost: 299.55,
    status: 'OPEN',
    currentLocations: [],
    qualityFlag: null,
    ...overrides,
  }
}

function mountTable(
  lots: TaxLotEntity[],
  history: Record<string, TaxLotHistoryEvent[]> = {},
  relocations: Record<string, LotRelocationEntity[]> = {},
) {
  return mount(ExpandedLotsTable, {
    props: {
      assetSymbol: 'XRP',
      assetAmount: 179.11,
      // A current price of 1.00 €/XRP against a 1.6724 basis puts every lot below water, so the
      // tax-loss affordance is live unless something suppresses it deliberately.
      assetCurrentValueEur: 179.11,
      lots,
      tokenHistory: history,
      tokenRelocations: relocations,
      isLoadingDetails: false,
    },
    global: {
      provide: {
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue('en'),
        },
      },
    },
  })
}

describe('ExpandedLotsTable — canonical lot status', () => {
  it('labels a CLOSED lot as closed, never as open', () => {
    const wrapper = mountTable([lot({ status: 'CLOSED', remainingQty: 0 })])
    const badge = wrapper.get('[data-testid="lot-status-badge"]')

    expect(badge.text()).toBe('lot_status.closed')
    expect(wrapper.text()).not.toContain('lot_status.open')
  })

  it('does not paint a CLOSED lot with the profit variant', () => {
    const wrapper = mountTable([lot({ status: 'CLOSED', remainingQty: 0 })])
    const badge = wrapper.get('[data-testid="lot-status-badge"]')

    expect(badge.classes().join(' ')).not.toContain('profit')
  })

  it('labels an untouched OPEN lot as open, never as sold', () => {
    const wrapper = mountTable([lot({ status: 'OPEN' })])
    const badge = wrapper.get('[data-testid="lot-status-badge"]')

    expect(badge.text()).toBe('lot_status.open')
    expect(wrapper.text()).not.toContain('lot_status.sold')
  })

  it('does not use the profit variant for an OPEN lot', () => {
    const wrapper = mountTable([lot({ status: 'OPEN' })])
    const badge = wrapper.get('[data-testid="lot-status-badge"]')

    expect(badge.classes().join(' ')).not.toContain('profit')
  })

  it('labels a PARTIAL lot as partial', () => {
    const wrapper = mountTable([lot({ status: 'PARTIAL', remainingQty: 79.11 })])

    expect(wrapper.get('[data-testid="lot-status-badge"]').text()).toBe('lot_status.partial')
  })

  it('keeps a fully relocated lot presented as open, since custody is not a disposal', () => {
    // Every unit has moved to another account, so remainingQty is untouched while a
    // quantity-derived status would have called this lot consumed.
    const wrapper = mountTable([
      lot({
        status: 'OPEN',
        currentLocations: [
          {
            accountId: 'acc-ledger' as AccountId,
            accountName: 'Ledger',
            isSynthetic: false,
            parentAccountId: null,
            qty: 179.11,
          },
        ],
      }),
    ])

    expect(wrapper.get('[data-testid="lot-status-badge"]').text()).toBe('lot_status.open')
  })

  it('does not dim an OPEN lot whose quantity has all moved away', () => {
    const wrapper = mountTable([lot({ status: 'OPEN', remainingQty: 179.11 })])

    expect(wrapper.get('[data-testid="lot-row"]').classes().join(' ')).not.toContain('grayscale')
  })
})

describe('ExpandedLotsTable — a basis we could not resolve is not a profit or a loss', () => {
  it('renders the data-quality indicator for a MISSING_PRICE lot', () => {
    const wrapper = mountTable([lot({ qualityFlag: 'MISSING_PRICE', unitCost: 0, totalCost: 0 })])

    expect(wrapper.find('[data-testid="lot-quality-flag"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('fifo_quality.missing_price.label')
  })

  it('suppresses the tax-loss suggestion on a MISSING_PRICE lot', () => {
    const wrapper = mountTable([lot({ qualityFlag: 'MISSING_PRICE', unitCost: 0, totalCost: 0 })])

    expect(wrapper.find('[data-testid="lot-tax-loss-hint"]').exists()).toBe(false)
  })

  it('suppresses the tax-loss suggestion on a NEGATIVE_COST_BASIS lot', () => {
    const wrapper = mountTable([lot({ qualityFlag: 'NEGATIVE_COST_BASIS', unitCost: 0 })])

    expect(wrapper.find('[data-testid="lot-tax-loss-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="lot-quality-flag"]').exists()).toBe(true)
  })

  it('renders the indicator rather than a judgement when the basis is zero and unflagged', () => {
    const wrapper = mountTable([lot({ unitCost: 0, totalCost: 0 })])

    expect(wrapper.find('[data-testid="lot-quality-flag"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lot-tax-loss-hint"]').exists()).toBe(false)
  })

  it('shows no resolved figure where an unreliable basis was forced to zero', () => {
    const wrapper = mountTable([lot({ qualityFlag: 'MISSING_PRICE', unitCost: 0, totalCost: 0 })])

    // '€0.00' would read as a free acquisition, which is the fabrication the flag exists to prevent.
    expect(wrapper.get('[data-testid="lot-unit-cost"]').text()).not.toContain('€0.00')
  })

  it('still offers the tax-loss affordance on a lot whose basis is trustworthy', () => {
    const wrapper = mountTable([lot({ unitCost: 1.6724 })])

    expect(wrapper.find('[data-testid="lot-tax-loss-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lot-quality-flag"]').exists()).toBe(false)
  })

  it('marks a manually declared basis as distinct from an observed one', () => {
    const wrapper = mountTable([lot({ valueProvenance: 'MANUAL' })])

    expect(wrapper.find('[data-testid="lot-manual-value"]').exists()).toBe(true)
  })

  it('does not mark a market-sourced basis as manual', () => {
    const wrapper = mountTable([lot({ valueProvenance: 'MARKET' })])

    expect(wrapper.find('[data-testid="lot-manual-value"]').exists()).toBe(false)
  })
})

describe('ExpandedLotsTable — split custody per account', () => {
  const split = lot({
    exchange: 'Kraken:spot',
    currentLocations: [
      {
        accountId: 'acc-binance' as AccountId,
        accountName: 'Binance',
        isSynthetic: false,
        parentAccountId: null,
        qty: 100,
      },
      {
        accountId: 'acc-ownwallet-xrp' as AccountId,
        accountName: 'ownwallet-XRP',
        isSynthetic: true,
        parentAccountId: null,
        qty: 79.11,
      },
    ],
  })

  it('displays every holding account with its quantity', () => {
    const wrapper = mountTable([split])
    const custody = wrapper.get('[data-testid="lot-custody"]').text()

    expect(custody).toContain('Binance')
    expect(custody).toContain('100')
    expect(custody).toContain('ownwallet-XRP')
    expect(custody).toContain('79.11')
  })

  it('retains the acquiring venue alongside the current holders', () => {
    const wrapper = mountTable([split])

    expect(wrapper.get('[data-testid="lot-acquired-at"]').text()).toContain('Kraken:spot')
  })

  it('marks a synthetic custody account distinctly from a real one', () => {
    const wrapper = mountTable([split])
    const entries = wrapper.findAll('[data-testid="lot-custody-entry"]')

    expect(entries).toHaveLength(2)
    expect(entries[0].attributes('data-synthetic')).toBe('false')
    expect(entries[1].attributes('data-synthetic')).toBe('true')
  })

  it('shows a staking sub-wallet as a sub-wallet of its parent', () => {
    const wrapper = mountTable([
      lot({
        currentLocations: [
          {
            accountId: 'acc-kraken-earn' as AccountId,
            accountName: 'Kraken:earn',
            isSynthetic: false,
            parentAccountId: 'acc-kraken' as AccountId,
            qty: 179.11,
          },
        ],
      }),
    ])
    const entry = wrapper.get('[data-testid="lot-custody-entry"]')

    expect(entry.attributes('data-sub-wallet')).toBe('true')
    expect(entry.text()).toContain('Kraken:earn')
  })

  it('renders no custody list when the quantity never left its acquiring venue', () => {
    const wrapper = mountTable([lot({ currentLocations: [] })])

    expect(wrapper.find('[data-testid="lot-custody-entry"]').exists()).toBe(false)
  })
})

describe('ExpandedLotsTable — Level 3 opens for a lot that only moved', () => {
  const MOVE: LotRelocationEntity = {
    id: 'rel-1',
    occurredAt: new Date('2026-01-05T00:00:00.000Z'),
    qty: 100,
    fromAccountId: 'kraken' as AccountId,
    fromAccountName: 'Kraken',
    fromIsSynthetic: false,
    toAccountId: 'ownwallet-XRP' as AccountId,
    toAccountName: 'ownwallet-XRP',
    toIsSynthetic: true,
  }

  it('offers the expansion affordance when the lot has relocations but no disposals', () => {
    const wrapper = mountTable([lot()], {}, { 'lot-1': [MOVE] })

    expect(wrapper.find('[data-testid="lot-row"] button').exists()).toBe(true)
  })

  it('offers no expansion affordance when the lot has neither', () => {
    const wrapper = mountTable([lot()], {}, {})

    expect(wrapper.find('[data-testid="lot-row"] button').exists()).toBe(false)
  })
})
