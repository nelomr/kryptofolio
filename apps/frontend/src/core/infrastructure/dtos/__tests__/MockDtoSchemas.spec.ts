/**
 * MockDtoSchemas — vocabulary parity with the real adapter.
 *
 * `domain-anti-corruption` requires mock and real payloads to be interchangeable at the port
 * boundary. A compile-time assignment to the domain type is the strongest check available here:
 * if either schema drifts from TaxLotEntity / TaxLotHistoryEvent, this file fails to type-check.
 */
import { describe, it, expect } from 'vitest'
import { MockTaxLotSchema, MockTaxLotHistorySchema, MockTokenHistorySchema } from '../MockDtoSchemas'
import type { TaxLotEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'

describe('MockTaxLotSchema — canonical status vocabulary', () => {
  it('accepts the canonical OPEN status', () => {
    const result = MockTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: new Date('2024-01-01'),
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'OPEN',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Compile-time proof of substitutability: assignable to the same domain entity the real
      // adapter produces.
      const asEntity: Pick<TaxLotEntity, 'status'> = { status: result.data.status! }
      expect(asEntity.status).toBe('OPEN')
    }
  })

  it('rejects the retired FULL vocabulary', () => {
    const result = MockTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: new Date('2024-01-01'),
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'FULL',
    })
    expect(result.success).toBe(false)
  })
})

describe('MockTaxLotHistorySchema — disposal provenance and nullable proceeds', () => {
  it('requires disposalType and types it as the canonical DisposalType union', () => {
    const result = MockTaxLotHistorySchema.safeParse({
      id: 'lot-1',
      disposalDate: new Date('2024-06-01'),
      amountFromLot: 1,
      salePriceEur: 2,
      gainLossEur: 0.5,
      isTaxable: true,
      disposalType: 'FEE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const asEntity: TaxLotHistoryEvent = result.data
      expect(asEntity.disposalType).toBe('FEE')
    }
  })

  it('rejects a missing disposalType', () => {
    const result = MockTaxLotHistorySchema.safeParse({
      id: 'lot-1',
      disposalDate: new Date('2024-06-01'),
      amountFromLot: 1,
      salePriceEur: 2,
      gainLossEur: 0.5,
      isTaxable: true,
    })
    expect(result.success).toBe(false)
  })

  it('preserves an unresolved salePriceEur as null, matching the real schema', () => {
    const result = MockTaxLotHistorySchema.safeParse({
      id: 'lot-1',
      disposalDate: new Date('2024-06-01'),
      amountFromLot: 1,
      salePriceEur: null,
      gainLossEur: null,
      isTaxable: false,
      disposalType: 'FEE',
      qualityFlag: 'MISSING_PRICE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.salePriceEur).toBeNull()
      expect(result.data.qualityFlag).toBe('MISSING_PRICE')
    }
  })
})

describe('MockTokenHistorySchema — canonical status vocabulary in the nested record', () => {
  it('rejects the retired PARTIAL... EMPTY vocabulary member', () => {
    const result = MockTokenHistorySchema.safeParse({
      lots: [],
      history: {
        'lot-1': { status: 'EMPTY', history: [] },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts the canonical CLOSED status', () => {
    const result = MockTokenHistorySchema.safeParse({
      lots: [],
      history: {
        'lot-1': { status: 'CLOSED', history: [] },
      },
    })
    expect(result.success).toBe(true)
  })
})
