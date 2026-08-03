/**
 * Level 3 events must name what actually happened.
 *
 * Every event previously rendered as a gain-or-loss badge alone, so a network fee and a sale looked
 * identical and a defect on the valuation was invisible.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import LotEventHistory from '../LotEventHistory.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type { LotRelocationEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import type { AccountId } from '@/core/domain/models/BrandedTypes'

vi.mock('@/composables/useFormatters', () => ({
  formatCurrency: (val: number | null) => (val === null ? '-' : `€${val.toFixed(2)}`),
  formatDate: () => '01 Jan 2024',
}))
vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

function event(overrides: Partial<TaxLotHistoryEvent> = {}): TaxLotHistoryEvent {
  return {
    id: 'evt-1',
    disposalDate: new Date('2026-01-25T00:00:00.000Z'),
    amountFromLot: 0.005,
    salePriceEur: 12.5,
    gainLossEur: 3.25,
    isTaxable: true,
    disposalType: 'SELL',
    flag: null,
    qualityFlag: null,
    ...overrides,
  }
}

function relocation(overrides: Partial<LotRelocationEntity> = {}): LotRelocationEntity {
  return {
    id: 'rel-1',
    occurredAt: new Date('2026-02-10T00:00:00.000Z'),
    qty: 0.5,
    fromAccountId: 'kraken' as AccountId,
    fromAccountName: 'Kraken',
    fromIsSynthetic: false,
    toAccountId: 'ownwallet-BTC' as AccountId,
    toAccountName: 'Own Wallet BTC',
    toIsSynthetic: true,
    ...overrides,
  }
}

function mountHistory(events: TaxLotHistoryEvent[], relocations: LotRelocationEntity[] = []) {
  return mount(LotEventHistory, {
    props: { events, relocations },
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

describe('LotEventHistory — a fee is not a sale', () => {
  it('renders the fee disposal type on a FEE event', () => {
    const wrapper = mountHistory([event({ disposalType: 'FEE' })])

    expect(wrapper.get('[data-testid="event-disposal-type"]').text()).toBe('disposal_type.fee')
  })

  it('does not label a FEE event as a sale', () => {
    const wrapper = mountHistory([event({ disposalType: 'FEE' })])

    expect(wrapper.text()).not.toContain('disposal_type.sell')
    expect(wrapper.text()).not.toContain('SELL')
  })

  it('renders the sale disposal type on a SELL event', () => {
    const wrapper = mountHistory([event({ disposalType: 'SELL' })])

    expect(wrapper.get('[data-testid="event-disposal-type"]').text()).toBe('disposal_type.sell')
  })

  it('renders the swap disposal type on a SWAP event', () => {
    const wrapper = mountHistory([event({ disposalType: 'SWAP' })])

    expect(wrapper.get('[data-testid="event-disposal-type"]').text()).toBe('disposal_type.swap')
  })
})

describe('LotEventHistory — defects and provenance are visible', () => {
  it('renders the data-quality flag with its severity weight', () => {
    const wrapper = mountHistory([
      event({ qualityFlag: 'MISSING_PRICE', isTaxable: false, salePriceEur: null, gainLossEur: null }),
    ])
    const flag = wrapper.get('[data-testid="event-quality-flag"]')

    expect(flag.text()).toContain('fifo_quality.missing_price.label')
    expect(flag.attributes('data-severity')).toBe('medium')
  })

  it('gives an UNTRACKED_INFLOW defect the highest visual weight', () => {
    const wrapper = mountHistory([event({ qualityFlag: 'UNTRACKED_INFLOW' })])

    expect(wrapper.get('[data-testid="event-quality-flag"]').attributes('data-severity')).toBe(
      'high',
    )
  })

  it('renders no defect indicator on a clean event', () => {
    const wrapper = mountHistory([event()])

    expect(wrapper.find('[data-testid="event-quality-flag"]').exists()).toBe(false)
  })

  it('keeps the fiscal classification and the data-quality defect both visible at once', () => {
    // The two vocabularies are orthogonal: neither may hide the other.
    const wrapper = mountHistory([
      event({ flag: 'WALLET_ACTIVATION', qualityFlag: 'MISSING_PRICE', isTaxable: false }),
    ])

    expect(wrapper.text()).toContain('lot_events.badge_activation')
    expect(wrapper.text()).toContain('fifo_quality.missing_price.label')
  })

  it('marks a manually declared figure as declared', () => {
    const wrapper = mountHistory([event({ valueProvenance: 'MANUAL' })])

    expect(wrapper.find('[data-testid="event-manual-value"]').exists()).toBe(true)
  })

  it('does not mark a market-sourced figure as declared', () => {
    const wrapper = mountHistory([event({ valueProvenance: 'MARKET' })])

    expect(wrapper.find('[data-testid="event-manual-value"]').exists()).toBe(false)
  })

  it('shows a non-taxable badge on an exempt event', () => {
    const wrapper = mountHistory([event({ isTaxable: false })])

    expect(wrapper.find('[data-testid="event-non-taxable"]').exists()).toBe(true)
  })

  it('shows no non-taxable badge on a taxable event', () => {
    const wrapper = mountHistory([event()])

    expect(wrapper.find('[data-testid="event-non-taxable"]').exists()).toBe(false)
  })

  it('renders no P&L figure where the gain could not be resolved', () => {
    const wrapper = mountHistory([event({ gainLossEur: null, salePriceEur: null })])
    const pnl = wrapper.get('[data-testid="event-pnl"]')

    expect(pnl.text()).not.toContain('€0.00')
    expect(pnl.classes().join(' ')).not.toContain('text-profit')
  })
})

/**
 * Level 3 is the lot's custody history, not only its disposals: a custody movement deliberately
 * emits no `lot_history_event`, so the relocations arrive from the custody ledger and the two record
 * types are merged here by date.
 */
describe('LotEventHistory — Level 3 merges disposals and relocations', () => {
  it('renders every record of a lot that was moved, partly sold and moved again', () => {
    const wrapper = mountHistory(
      [
        event({ id: 'evt-sale', disposalDate: new Date('2026-03-01T00:00:00.000Z') }),
      ],
      [
        relocation({ id: 'rel-a', occurredAt: new Date('2026-02-01T00:00:00.000Z') }),
        relocation({ id: 'rel-b', occurredAt: new Date('2026-04-01T00:00:00.000Z') }),
      ],
    )

    expect(wrapper.findAll('[data-testid="timeline-row"]')).toHaveLength(3)
  })

  it('orders the merged records chronologically, not source by source', () => {
    const wrapper = mountHistory(
      [event({ id: 'evt-sale', disposalDate: new Date('2026-03-01T00:00:00.000Z') })],
      [
        relocation({ id: 'rel-a', occurredAt: new Date('2026-02-01T00:00:00.000Z') }),
        relocation({ id: 'rel-b', occurredAt: new Date('2026-04-01T00:00:00.000Z') }),
      ],
    )

    const kinds = wrapper
      .findAll('[data-testid="timeline-row"]')
      .map((row) => row.attributes('data-kind'))

    expect(kinds).toEqual(['RELOCATION', 'DISPOSAL', 'RELOCATION'])
  })

  it('distinguishes a relocation from a disposal', () => {
    const wrapper = mountHistory([event()], [relocation()])

    expect(wrapper.findAll('[data-kind="RELOCATION"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-kind="DISPOSAL"]')).toHaveLength(1)
    expect(wrapper.get('[data-kind="RELOCATION"]').text()).toContain('custody.relocation')
  })

  it('names both ends of a relocation', () => {
    const wrapper = mountHistory([], [relocation()])
    const row = wrapper.get('[data-kind="RELOCATION"]')

    expect(row.text()).toContain('Kraken')
    expect(row.text()).toContain('Own Wallet BTC')
  })

  it('marks a synthetic custody counterparty as such', () => {
    const wrapper = mountHistory([], [relocation()])

    expect(wrapper.find('[data-testid="relocation-synthetic"]').exists()).toBe(true)
  })

  it('shows no profit or loss figure on a relocation', () => {
    const wrapper = mountHistory([], [relocation()])
    const pnl = wrapper.get('[data-kind="RELOCATION"] [data-testid="relocation-pnl"]')

    expect(pnl.text()).not.toContain('€')
    expect(pnl.classes().join(' ')).not.toContain('text-profit')
    expect(pnl.classes().join(' ')).not.toContain('text-loss')
  })

  it('marks a relocation non-taxable', () => {
    const wrapper = mountHistory([], [relocation()])

    expect(wrapper.get('[data-kind="RELOCATION"]').text()).toContain('lot_events.non_taxable')
  })

  it('renders a lot that never moved as its disposals alone, with no relocation section', () => {
    const wrapper = mountHistory([event()], [])

    expect(wrapper.findAll('[data-kind="DISPOSAL"]')).toHaveLength(1)
    expect(wrapper.find('[data-kind="RELOCATION"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('custody.relocation')
  })

  it('carries the relocated quantity in mono, as a magnitude rather than a signed disposal', () => {
    const wrapper = mountHistory([], [relocation({ qty: 0.5 })])
    const qty = wrapper.get('[data-testid="relocation-qty"]')

    expect(qty.text()).toContain('0.5')
    expect(qty.text()).not.toContain('-0.5')
    expect(qty.classes().join(' ')).toContain('font-mono')
  })
})
