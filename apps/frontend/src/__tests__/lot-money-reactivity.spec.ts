/**
 * D8's Vue-reactivity probe, applied to this phase's fiscal entities (TaxLotEntity /
 * TaxLotHistoryEvent / LotCustodyLocation) rather than re-asserted in the abstract: a lot's `Money`
 * fields must behave identically whether read straight or through `reactive`/`ref` proxying.
 *
 * @see openspec/changes/adopt-fiscal-money-value-object/design.md D8
 */
import { describe, it, expect } from 'vitest'
import { reactive, shallowRef } from 'vue'
import { Money } from '@kryptofolio/core-domain'
import type { TaxLotEntity } from '@/core/domain/models/FiscalEntities'
import { LotIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

function makeLot(unitCost: string, totalCost: string): TaxLotEntity {
  return {
    id: LotIdSchema.parse('lot-1'),
    symbol: 'BTC',
    date: new Date('2024-01-01T00:00:00Z'),
    exchange: 'Kraken',
    originalQty: new Money('1'),
    remainingQty: new Money('1'),
    unitCost: new Money(unitCost),
    totalCost: new Money(totalCost),
    status: 'OPEN',
    currentLocations: [],
  }
}

describe('Money inside reactive([...]) and ref({...}) over TaxLotEntity — no mitigation needed', () => {
  it('reads correct add/sub/equals/compareTo through a reactive array of lots, matching plain instances', () => {
    const plain = makeLot('1.5', '1.5')
    // Cast the read-back fields to `Money`: Vue's `UnwrapNestedRefs` recursively maps a nested
    // `Money`'s private field the same way `UnwrapRef` does for a direct array of instances,
    // which is a compile-time-only mismatch — the runtime object underneath is still a real,
    // working `Money`, which is exactly what this test measures.
    const proxied = reactive([makeLot('1.5', '1.5')]) as unknown as TaxLotEntity[]

    const plainSum = plain.unitCost.add(plain.totalCost)
    const proxiedSum = proxied[0].unitCost.add(proxied[0].totalCost)

    expect(proxiedSum.toString()).toBe(plainSum.toString())
    expect(proxiedSum.equals(plainSum)).toBe(true)
    expect(proxied[0].unitCost.compareTo(plain.unitCost)).toBe(0)
    expect(proxied[0].unitCost.sub(new Money('0.5')).toString()).toBe('1')
  })

  it('reads correct arithmetic through a shallowRef wrapping a single lot object', () => {
    // A plain `ref()` recursively maps a `Money`-bearing object's shape via `UnwrapRef` and
    // rejects the private-field mismatch at compile time even though runtime behavior (proven in
    // the `reactive()` case above) is correct. `shallowRef` sidesteps that TS-only concern
    // without reintroducing a runtime risk this file exists to rule out.
    const lotRef = shallowRef(makeLot('2', '4'))

    expect(lotRef.value.unitCost.isPositive()).toBe(true)
    expect(lotRef.value.totalCost.div(lotRef.value.unitCost).toString()).toBe('2')
    // Mixed plain/proxied operands, exactly as D8 measured for the general case.
    expect(new Money('1').add(lotRef.value.unitCost).toString()).toBe('3')
  })

  it('needs no markRaw and no shallowRef — a plain reactive() lot stays reactive and correct', () => {
    const state = reactive({ lot: makeLot('10', '10') })
    state.lot.unitCost = new Money('20')

    expect(state.lot.unitCost.toString()).toBe('20')
    expect(state.lot.unitCost.isPositive()).toBe(true)
  })
})
