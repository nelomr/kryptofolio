import { describe, it, expect } from 'vitest'
import { shallowRef } from 'vue'
import { Money } from '@kryptofolio/core-domain'
import type { TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'
import { useDerivativesSort, getNetImpact, getPnlClass } from '../useDerivativesTable'

function derivative(overrides: Partial<TaxDerivativeEntity> = {}): TaxDerivativeEntity {
  return {
    id: 'tx-1' as TaxDerivativeEntity['id'],
    type: 'FUTURES_TRADE',
    contractSymbol: 'pf_btcusd',
    underlyingAsset: 'btc',
    amount: null,
    tradePrice: null,
    realizedPnl: null,
    fees: null,
    funding: null,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('getNetImpact', () => {
  it('computes funding minus fees exactly, past the float boundary', () => {
    const tx = derivative({ fees: new Money('0.1'), funding: new Money('0.3') })
    const result = getNetImpact(tx)
    expect(result?.equals(new Money('0.2'))).toBe(true)
  })

  it('returns null when fees is null, even when funding is a resolved non-zero', () => {
    const tx = derivative({ fees: null, funding: new Money('5') })
    expect(getNetImpact(tx)).toBeNull()
  })

  it('returns null when funding is null, even when fees is a resolved non-zero', () => {
    const tx = derivative({ fees: new Money('5'), funding: null })
    expect(getNetImpact(tx)).toBeNull()
  })

  it('never treats a null operand as zero — both null still yields null', () => {
    const tx = derivative({ fees: null, funding: null })
    expect(getNetImpact(tx)).toBeNull()
  })
})

describe('getPnlClass', () => {
  it('takes the neutral class for a null (unresolved) pnl', () => {
    expect(getPnlClass(null)).toBe('text-muted-foreground font-mono')
  })

  it('takes the gain class for a positive pnl', () => {
    expect(getPnlClass(new Money('100'))).toBe('text-profit font-bold font-mono')
  })

  it('takes the loss class for a negative pnl', () => {
    expect(getPnlClass(new Money('-100'))).toBe('text-loss font-bold font-mono')
  })
})

describe('useDerivativesSort', () => {
  it('orders realizedPnl correctly past the float boundary, ascending', () => {
    const a = derivative({ id: 'a' as TaxDerivativeEntity['id'], realizedPnl: new Money('1.001') })
    const b = derivative({ id: 'b' as TaxDerivativeEntity['id'], realizedPnl: new Money('1.002') })
    const { sortKey, sortOrder, toggleSort, sorted } = useDerivativesSort(shallowRef([b, a]))
    toggleSort('realizedPnl')
    sortOrder.value = 'asc'
    expect(sortKey.value).toBe('realizedPnl')
    expect(sorted.value.map((tx) => tx.id)).toEqual(['a', 'b'])
  })

  it('orders realizedPnl correctly past the float boundary, descending', () => {
    const a = derivative({ id: 'a' as TaxDerivativeEntity['id'], realizedPnl: new Money('1.001') })
    const b = derivative({ id: 'b' as TaxDerivativeEntity['id'], realizedPnl: new Money('1.002') })
    const { sortOrder, toggleSort, sorted } = useDerivativesSort(shallowRef([a, b]))
    toggleSort('realizedPnl')
    sortOrder.value = 'desc'
    expect(sorted.value.map((tx) => tx.id)).toEqual(['b', 'a'])
  })

  it('sorts a null realizedPnl last in ascending order', () => {
    const resolved = derivative({ id: 'resolved' as TaxDerivativeEntity['id'], realizedPnl: new Money('-1000') })
    const unresolved = derivative({ id: 'unresolved' as TaxDerivativeEntity['id'], realizedPnl: null })
    const { sortOrder, toggleSort, sorted } = useDerivativesSort(shallowRef([unresolved, resolved]))
    toggleSort('realizedPnl')
    sortOrder.value = 'asc'
    expect(sorted.value.map((tx) => tx.id)).toEqual(['resolved', 'unresolved'])
  })

  it('sorts a null realizedPnl last in descending order too', () => {
    const resolved = derivative({ id: 'resolved' as TaxDerivativeEntity['id'], realizedPnl: new Money('1000') })
    const unresolved = derivative({ id: 'unresolved' as TaxDerivativeEntity['id'], realizedPnl: null })
    const { sortOrder, toggleSort, sorted } = useDerivativesSort(shallowRef([unresolved, resolved]))
    toggleSort('realizedPnl')
    sortOrder.value = 'desc'
    expect(sorted.value.map((tx) => tx.id)).toEqual(['resolved', 'unresolved'])
  })
})
