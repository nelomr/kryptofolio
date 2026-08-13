/**
 * Presentation of a `ConvertedAmount`.
 *
 * The frontend renders what the backend resolved: this maps the three conversion outcomes onto
 * three display shapes and applies no rate to anything. The three arms stay distinguishable all
 * the way to the template, because a converted figure, a native one and an unconvertible one mean
 * different things to a reader and only the first two are denominated in the currency he chose.
 */

import { describe, it, expect } from 'vitest'
import { describeConvertedAmount } from '@/composables/useConvertedAmountDisplay'

describe('describeConvertedAmount (task 9.3)', () => {
  it('renders a converted figure with the requested currency symbol', () => {
    const display = describeConvertedAmount({
      kind: 'CONVERTED',
      amount: '1088.00',
      currency: 'EUR',
      rate: '1.088',
      rateDate: '2024-03-14',
    })

    expect(display.kind).toBe('CONVERTED')
    expect(display.text).toContain('€')
    expect(display.text).not.toContain('$')
    expect(display.text).toContain('1,088')
  })

  it('renders a native figure with its own currency symbol', () => {
    const display = describeConvertedAmount({
      kind: 'NATIVE',
      amount: '1000.00',
      currency: 'USD',
    })

    expect(display.kind).toBe('NATIVE')
    expect(display.text).toContain('$')
    expect(display.text).not.toContain('€')
  })

  it('reports the rate and rate date only for the converted arm', () => {
    const converted = describeConvertedAmount({
      kind: 'CONVERTED',
      amount: '1088.00',
      currency: 'EUR',
      rate: '1.088',
      rateDate: '2024-03-14',
    })
    const native = describeConvertedAmount({ kind: 'NATIVE', amount: '1000.00', currency: 'USD' })

    expect(converted).toMatchObject({ rate: '1.088', rateDate: '2024-03-14' })
    expect('rate' in native).toBe(false)
  })

  it('renders an unconvertible figure in its native currency, not the requested one', () => {
    const display = describeConvertedAmount({
      kind: 'UNCONVERTIBLE',
      nativeAmount: '1000.00',
      nativeCurrency: 'EUR',
      requested: 'USD',
    })

    expect(display.kind).toBe('UNCONVERTIBLE')
    expect(display.text).toContain('€')
    expect(display.text).not.toContain('$')
    expect(display).toMatchObject({ currency: 'EUR', requested: 'USD' })
  })

  it('does not blank or zero an unconvertible figure', () => {
    const display = describeConvertedAmount({
      kind: 'UNCONVERTIBLE',
      nativeAmount: '1000.00',
      nativeCurrency: 'EUR',
      requested: 'USD',
    })

    expect(display.text).toContain('1,000')
    expect(display.text).not.toMatch(/^\D*0[.,]00\D*$/)
  })

  it('keeps a genuine zero readable as a zero rather than as unconvertible', () => {
    const display = describeConvertedAmount({
      kind: 'CONVERTED',
      amount: '0',
      currency: 'EUR',
      rate: '1.088',
      rateDate: '2024-03-14',
    })

    expect(display.kind).toBe('CONVERTED')
    expect(display.text).toContain('0')
  })
})

describe('summariseConversion (task 9.4)', () => {
  it('reports an all-native portfolio as unconverted, with no rate basis to state', async () => {
    const { summariseConversion } = await import('@/composables/useConvertedAmountDisplay')

    expect(
      summariseConversion([
        { kind: 'NATIVE', amount: '10', currency: 'USD' },
        { kind: 'NATIVE', amount: '20', currency: 'USD' },
      ]),
    ).toEqual({ kind: 'UNCONVERTED' })
  })

  it('reports the distinct rate dates applied when figures were converted', async () => {
    const { summariseConversion } = await import('@/composables/useConvertedAmountDisplay')

    expect(
      summariseConversion([
        { kind: 'CONVERTED', amount: '10', currency: 'EUR', rate: '1.05', rateDate: '2024-01-05' },
        { kind: 'CONVERTED', amount: '20', currency: 'EUR', rate: '1.15', rateDate: '2024-06-11' },
        { kind: 'CONVERTED', amount: '30', currency: 'EUR', rate: '1.05', rateDate: '2024-01-05' },
      ]),
    ).toEqual({
      kind: 'CONVERTED',
      displayCurrency: 'EUR',
      rateDates: ['2024-01-05', '2024-06-11'],
    })
  })

  it('reports the unconvertible figures separately from the converted ones', async () => {
    const { summariseConversion } = await import('@/composables/useConvertedAmountDisplay')

    expect(
      summariseConversion([
        { kind: 'CONVERTED', amount: '10', currency: 'EUR', rate: '1.05', rateDate: '2024-01-05' },
        { kind: 'UNCONVERTIBLE', nativeAmount: '20', nativeCurrency: 'USD', requested: 'EUR' },
      ]),
    ).toEqual({
      kind: 'PARTIALLY_CONVERTED',
      displayCurrency: 'EUR',
      rateDates: ['2024-01-05'],
      unconvertibleCount: 1,
    })
  })

  it('reports an empty portfolio as unconverted rather than inventing a display currency', async () => {
    const { summariseConversion } = await import('@/composables/useConvertedAmountDisplay')

    expect(summariseConversion([])).toEqual({ kind: 'UNCONVERTED' })
  })
})
