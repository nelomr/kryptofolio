/**
 * The pending-review surface: the rows a user can actually resolve, and the affordance to do it.
 *
 * Presentational only — the query and the mutation are injected by the owning view, so nothing here
 * reaches for a store.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import PendingValuesReview from '../PendingValuesReview.vue'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type { FiscalIntegrityDefectEntity } from '@/core/domain/models/FiscalEntities'

vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

function defect(overrides: Partial<FiscalIntegrityDefectEntity> = {}): FiscalIntegrityDefectEntity {
  return {
    qualityFlag: 'MISSING_PRICE',
    severity: 'medium',
    assetId: 'XRP',
    accountId: 'acc-kraken',
    txId: 'hash-a',
    occurredAt: '2026-01-25T00:00:00.000Z',
    detailKey: 'fifo_quality.missing_price.explanation',
    pendingReview: true,
    ...overrides,
  }
}

function mountReview(props: Record<string, unknown>) {
  return mount(PendingValuesReview, {
    props: { rows: [defect()], isLoading: false, isSubmitting: false, ...props },
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

describe('PendingValuesReview', () => {
  it('lists a pending row with its asset and the defect that made it pending', () => {
    const wrapper = mountReview({})
    const row = wrapper.get('[data-testid="pending-row"]')

    expect(row.text()).toContain('XRP')
    expect(row.text()).toContain('fifo_quality.missing_price.label')
  })

  it('exposes an assignment affordance on a MISSING_PRICE row', () => {
    const wrapper = mountReview({})

    expect(wrapper.find('[data-testid="assign-price"]').exists()).toBe(true)
  })

  it('exposes a destination affordance on an UNTRACKED_INFLOW row', () => {
    const wrapper = mountReview({
      rows: [defect({ qualityFlag: 'UNTRACKED_INFLOW', severity: 'high' })],
    })

    expect(wrapper.find('[data-testid="assign-destination"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="assign-price"]').exists()).toBe(false)
  })

  it('emits the declared price with its currency and the row identity', async () => {
    const wrapper = mountReview({})

    await wrapper.get('[data-testid="assign-price"]').trigger('click')
    await wrapper.get('[data-testid="price-input"]').setValue('0.42')
    await wrapper.get('[data-testid="price-submit"]').trigger('submit')

    expect(wrapper.emitted('assignPrice')).toEqual([
      [{ idHash: 'hash-a', priceFiat: '0.42', fiatCurrency: 'EUR' }],
    ])
  })

  it('does not emit a declaration with no value entered', async () => {
    const wrapper = mountReview({})

    await wrapper.get('[data-testid="assign-price"]').trigger('click')
    await wrapper.get('[data-testid="price-submit"]').trigger('submit')

    expect(wrapper.emitted('assignPrice')).toBeUndefined()
  })

  it('keeps the entered amount as a decimal string rather than a number', async () => {
    const wrapper = mountReview({})

    await wrapper.get('[data-testid="assign-price"]').trigger('click')
    await wrapper.get('[data-testid="price-input"]').setValue('0.10')
    await wrapper.get('[data-testid="price-submit"]').trigger('submit')

    const payload = wrapper.emitted('assignPrice')?.[0]?.[0] as { priceFiat: unknown }
    expect(payload.priceFiat).toBe('0.10')
  })

  it('emits the declared destination account', async () => {
    const wrapper = mountReview({
      rows: [defect({ qualityFlag: 'UNTRACKED_INFLOW', severity: 'high' })],
      accounts: [{ id: 'acc-ledger', name: 'Ledger' }],
    })

    await wrapper.get('[data-testid="assign-destination"]').trigger('click')
    await wrapper.get('[data-testid="destination-select"]').setValue('acc-ledger')
    await wrapper.get('[data-testid="destination-submit"]').trigger('submit')

    expect(wrapper.emitted('assignDestination')).toEqual([
      [{ idHash: 'hash-a', counterpartyAccountId: 'acc-ledger' }],
    ])
  })

  it('states that pending rows are excluded from the tax base', () => {
    const wrapper = mountReview({})

    expect(wrapper.text()).toContain('tax.pending.excluded_notice')
  })

  it('reports an empty state rather than an empty list when nothing is pending', () => {
    const wrapper = mountReview({ rows: [] })

    expect(wrapper.find('[data-testid="pending-row"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('tax.pending.none')
  })

  it('renders official skeletons matching the row geometry while loading', () => {
    const wrapper = mountReview({ isLoading: true, rows: [] })
    const skeletons = wrapper.findAllComponents(Skeleton)

    expect(skeletons.length).toBeGreaterThan(0)
    // The loading placeholder must be the shared Skeleton, not a hand-rolled pulsing div.
    expect(wrapper.findAll('[data-testid="pending-skeleton"]').length).toBe(skeletons.length)
  })

  it('disables the affordance while a declaration is in flight', () => {
    const wrapper = mountReview({ isSubmitting: true })

    expect(wrapper.get('[data-testid="assign-price"]').attributes('disabled')).toBeDefined()
  })
})
