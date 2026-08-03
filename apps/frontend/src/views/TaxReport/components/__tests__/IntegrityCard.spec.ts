/**
 * The Fiscal Hospital, sourced from the backend's data-quality view rather than inferred here.
 *
 * The card previously took a hand-built warning list with client-authored prose, which is what let
 * the real defect vocabulary go unreported entirely.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import IntegrityCard from '../IntegrityCard.vue'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type {
  FiscalIntegrityGroupEntity,
  FiscalIntegrityReportEntity,
} from '@/core/domain/models/FiscalEntities'

vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

function group(
  overrides: Partial<FiscalIntegrityGroupEntity> = {},
): FiscalIntegrityGroupEntity {
  return {
    qualityFlag: 'MISSING_PRICE',
    severity: 'medium',
    count: 3,
    pendingReview: 3,
    rows: [
      {
        qualityFlag: 'MISSING_PRICE',
        severity: 'medium',
        assetId: 'XRP',
        accountId: 'acc-kraken',
        txId: 'hash-a',
        occurredAt: '2026-01-25T00:00:00.000Z',
        detailKey: 'fifo_quality.missing_price.explanation',
        pendingReview: true,
      },
    ],
    ...overrides,
  }
}

function report(
  overrides: Partial<FiscalIntegrityReportEntity> = {},
): FiscalIntegrityReportEntity {
  return {
    groups: [group()],
    totalDefects: 3,
    pendingReview: 3,
    needsRecalculation: false,
    ...overrides,
  }
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(IntegrityCard, {
    props: { report: report(), isLoading: false, isRebuilding: false, ...props },
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

describe('IntegrityCard — defects come from the backend, grouped', () => {
  it('reports each flag with its count and the assets affected', () => {
    const wrapper = mountCard()
    const entry = wrapper.get('[data-testid="integrity-group"]')

    expect(entry.text()).toContain('fifo_quality.missing_price.label')
    expect(entry.text()).toContain('3')
    expect(entry.text()).toContain('XRP')
  })

  it('states that flagged events are excluded from the tax base', () => {
    const wrapper = mountCard()

    expect(wrapper.text()).toContain('fifo_quality.missing_price.explanation')
  })

  it('shows a healthy state when the backend reports no defects', () => {
    const wrapper = mountCard({
      report: report({ groups: [], totalDefects: 0, pendingReview: 0 }),
    })

    expect(wrapper.text()).toContain('tax.integrity.healthy')
    expect(wrapper.find('[data-testid="integrity-group"]').exists()).toBe(false)
  })

  it('reports the pending-review count so the user is notified rather than blocked', () => {
    const wrapper = mountCard()

    expect(wrapper.get('[data-testid="integrity-pending-count"]').text()).toContain('3')
  })

  it('gives the highest severity present the most prominent weight', () => {
    const wrapper = mountCard({
      report: report({
        groups: [
          group({ qualityFlag: 'CUSTODY_RESIDUAL', severity: 'low', count: 9, pendingReview: 0 }),
          group({ qualityFlag: 'UNTRACKED_INFLOW', severity: 'high', count: 1, pendingReview: 1 }),
        ],
      }),
    })

    expect(wrapper.get('[data-testid="integrity-headline-severity"]').text()).toBe('high')
  })

  it('orders the groups worst first, not in the order they arrived', () => {
    const wrapper = mountCard({
      report: report({
        groups: [
          group({ qualityFlag: 'CUSTODY_RESIDUAL', severity: 'low' }),
          group({ qualityFlag: 'UNTRACKED_INFLOW', severity: 'high' }),
        ],
      }),
    })
    const severities = wrapper
      .findAll('[data-testid="integrity-group"]')
      .map((g) => g.attributes('data-severity'))

    expect(severities).toEqual(['high', 'low'])
  })

  it('renders official skeletons while loading', () => {
    const wrapper = mountCard({ isLoading: true, report: null })

    expect(wrapper.findAllComponents(Skeleton).length).toBeGreaterThan(0)
  })
})

describe('IntegrityCard — pending recalculation and the explicit rebuild', () => {
  it('indicates that derived figures are stale when a recalculation is pending', () => {
    const wrapper = mountCard({ report: report({ needsRecalculation: true }) })

    expect(wrapper.find('[data-testid="needs-recalculation"]').exists()).toBe(true)
  })

  it('offers the rebuild action when a recalculation is pending', async () => {
    const wrapper = mountCard({ report: report({ needsRecalculation: true }) })

    await wrapper.get('[data-testid="rebuild-action"]').trigger('click')

    expect(wrapper.emitted('rebuild')).toHaveLength(1)
  })

  it('shows no stale indicator when derived figures are current', () => {
    const wrapper = mountCard({ report: report({ needsRecalculation: false }) })

    expect(wrapper.find('[data-testid="needs-recalculation"]').exists()).toBe(false)
  })

  it('keeps the rebuild available on a healthy ledger, since it is an explicit retry', () => {
    const wrapper = mountCard({
      report: report({ groups: [], totalDefects: 0, pendingReview: 0 }),
    })

    expect(wrapper.find('[data-testid="rebuild-action"]').exists()).toBe(true)
  })

  it('disables the rebuild while one is already running', () => {
    const wrapper = mountCard({ isRebuilding: true })

    expect(wrapper.get('[data-testid="rebuild-action"]').attributes('disabled')).toBeDefined()
  })
})
