/**
 * Four states the holdings panel must keep apart.
 *
 * An unconvertible figure, an empty portfolio, a failed load and a genuine zero all used to reduce
 * to "nothing useful on screen". They are different facts and lead to different remedies: seed the
 * FX ledger, import a file, retry, or nothing at all. The panel renders four distinguishable
 * things, and this asserts that no two of them collapse.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LotHierarchyTable from '../LotHierarchyTable.vue'
import ConversionNotice from '../ConversionNotice.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type { HoldingEntity } from '@/core/domain/models/PortfolioEntities'
import type { AssetId } from '@/core/domain/models/BrandedTypes'
import type { ConvertedAmount } from '@kryptofolio/shared-types'
import type { I18nPort } from '@/core/domain/ports/I18nPort'

vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: () => ({
    value: {
      getVirtualItems: () => [{ index: 0, start: 0, end: 64, size: 64, key: '0' }],
      getTotalSize: () => 64,
    },
  }),
}))

vi.mock('@/components/ui/skeleton/Skeleton.vue', () => ({ default: { template: '<div></div>' } }))
vi.mock('@/components/common/CryptoIcon', () => ({ CryptoIcon: { template: '<div></div>' } }))

const i18n: I18nPort = {
  translate: (key: string) => key,
  setLocale: vi.fn(),
  getLocale: () => 'en',
  getSupportedLocales: () => [],
}

function holding(costBasis: ConvertedAmount): HoldingEntity {
  return {
    id: 'asset-1' as AssetId,
    symbol: 'BTC',
    amount: 1,
    avgPriceFiat: 1000,
    currentValueFiat: 1200,
    costBasisFiat: 1000,
    unrealizedPnlFiat: 200,
    pnlFiat: 200,
    currency: 'EUR',
    portfolioLocations: ['Kraken'],
    costBasis,
  }
}

/** The subset of the table's props these scenarios drive. */
interface TableProps {
  data: HoldingEntity[]
  loadError?: Error | null
}

function mountTable(props: TableProps) {
  return mount(LotHierarchyTable, {
    props,
    global: { provide: { [I18N_PORT_KEY as unknown as string]: i18n } },
  })
}

const UNCONVERTIBLE: ConvertedAmount = {
  kind: 'UNCONVERTIBLE',
  nativeAmount: '1000.00',
  nativeCurrency: 'EUR',
  requested: 'USD',
}

describe('the unconvertible state is its own state (task 9.5)', () => {
  it('renders the native amount and labels it unconverted', () => {
    const wrapper = mountTable({ data: [holding(UNCONVERTIBLE)] })

    expect(wrapper.find('[data-testid="cost-basis-unconverted"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('1,000')
    expect(wrapper.text()).toContain('portfolio.conversion.unconverted')
  })

  it('is not the empty-portfolio state', () => {
    const unconvertible = mountTable({ data: [holding(UNCONVERTIBLE)] })
    const empty = mountTable({ data: [] })

    expect(empty.text()).toContain('portfolio.no_assets')
    expect(unconvertible.text()).not.toContain('portfolio.no_assets')
    expect(empty.find('[data-testid="cost-basis-unconverted"]').exists()).toBe(false)
  })

  it('is not the load-error state', () => {
    const unconvertible = mountTable({ data: [holding(UNCONVERTIBLE)] })
    const failed = mountTable({ data: [], loadError: new Error('network down') })

    expect(failed.find('[data-testid="holdings-load-error"]').exists()).toBe(true)
    expect(failed.text()).not.toContain('portfolio.no_assets')
    expect(unconvertible.find('[data-testid="holdings-load-error"]').exists()).toBe(false)
  })

  it('is not a zero', () => {
    const zero = mountTable({
      data: [
        holding({
          kind: 'CONVERTED',
          amount: '0',
          currency: 'USD',
          rate: '1.088',
          rateDate: '2024-03-14',
        }),
      ],
    })

    expect(zero.find('[data-testid="cost-basis-unconverted"]').exists()).toBe(false)
    expect(zero.text()).not.toContain('portfolio.conversion.unconverted')
    expect(zero.text()).toContain('0')
  })
})

describe('the converted view announces itself and its rate basis (task 9.4)', () => {
  it('states the display currency and the rate dates applied', () => {
    const wrapper = mount(ConversionNotice, {
      props: {
        summary: {
          kind: 'CONVERTED',
          displayCurrency: 'USD',
          rateDates: ['2024-01-05', '2024-06-11'],
        },
      },
      global: { provide: { [I18N_PORT_KEY as unknown as string]: i18n } },
    })

    expect(wrapper.find('[data-testid="conversion-notice"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('2024-01-05')
    expect(wrapper.text()).toContain('2024-06-11')
  })

  it('says nothing at all when no figure was converted', () => {
    const wrapper = mount(ConversionNotice, {
      props: { summary: { kind: 'UNCONVERTED' } },
      global: { provide: { [I18N_PORT_KEY as unknown as string]: i18n } },
    })

    expect(wrapper.find('[data-testid="conversion-notice"]').exists()).toBe(false)
  })

  it('reports the unconvertible figures as a separate warning', () => {
    const wrapper = mount(ConversionNotice, {
      props: {
        summary: {
          kind: 'PARTIALLY_CONVERTED',
          displayCurrency: 'USD',
          rateDates: ['2024-01-05'],
          unconvertibleCount: 2,
        },
      },
      global: { provide: { [I18N_PORT_KEY as unknown as string]: i18n } },
    })

    expect(wrapper.find('[data-testid="conversion-incomplete"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('2')
  })
})
