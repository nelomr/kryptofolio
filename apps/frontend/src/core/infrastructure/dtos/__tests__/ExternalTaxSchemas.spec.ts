/**
 * ExternalTaxSchemas — anti-corruption layer realignment tests.
 *
 * Group 10 rewired the backend to send the canonical OPEN|PARTIAL|CLOSED status, nullable
 * proceeds, a real disposalType, and custody locations. These tests pin the client-side half of
 * that contract, which the pre-existing zod-schemas.test.ts never exercised because it authors
 * its own fixtures against the retired FULL|PARTIAL|EMPTY vocabulary.
 */
import { describe, it, expect } from 'vitest'
import {
  ExternalTaxLotSchema,
  ExternalTaxLotHistorySchema,
  ExternalTokenHistorySchema,
} from '../ExternalTaxSchemas'

describe('ExternalTaxLotSchema — canonical status vocabulary', () => {
  it('accepts OPEN', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'OPEN',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('OPEN')
    }
  })

  it('accepts CLOSED', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 0,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'CLOSED',
    })
    expect(result.success).toBe(true)
  })

  it('rejects the retired FULL vocabulary', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'FULL',
    })
    expect(result.success).toBe(false)
  })

  it('rejects the retired EMPTY vocabulary', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 0,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'EMPTY',
    })
    expect(result.success).toBe(false)
  })

  it('requires status — a missing status is not a valid lot', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
    })
    expect(result.success).toBe(false)
  })

  it('parses split custody across accounts, marking the synthetic one', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 179.11,
      remaining_qty: 179.11,
      unit_cost: 1.6724,
      total_cost: 299.46,
      status: 'OPEN',
      custody: [
        { account_id: 'acc-binance', account_name: 'Binance', is_synthetic: false, parent_account_id: null, qty: 100 },
        { account_id: 'ownwallet-XRP', account_name: 'ownwallet-XRP', is_synthetic: true, parent_account_id: null, qty: 79.11 },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currentLocations).toHaveLength(2)
      expect(result.data.currentLocations[1].isSynthetic).toBe(true)
      expect(result.data.currentLocations[1].qty).toBe(79.11)
    }
  })

  it('defaults currentLocations to an empty array when the backend omits it', () => {
    const result = ExternalTaxLotSchema.safeParse({
      id: 'lot-1',
      symbol: 'XRP',
      date: '2024-01-01',
      exchange: 'Kraken',
      original_qty: 100,
      remaining_qty: 100,
      unit_cost: 1.5,
      total_cost: 150,
      status: 'OPEN',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currentLocations).toEqual([])
    }
  })
})

describe('ExternalTaxLotHistorySchema — provenance, quality flags, nullable proceeds', () => {
  const base = {
    id: 'evt-1',
    disposal_date: '2024-06-01',
    amount_from_lot: 10,
    sale_fee_eur: 0.5,
    is_taxable: true,
  }

  it('parses operation_type as the typed disposalType field', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 2,
      gain_loss_eur: 0.5,
      operation_type: 'FEE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.disposalType).toBe('FEE')
    }
  })

  it('requires operation_type', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 2,
      gain_loss_eur: 0.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an operation_type outside the canonical vocabulary', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 2,
      gain_loss_eur: 0.5,
      operation_type: 'SELL_ALL',
    })
    expect(result.success).toBe(false)
  })

  it('preserves an unresolved sale_price_eur as null rather than 0', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: null,
      gain_loss_eur: null,
      operation_type: 'FEE',
      is_taxable: false,
      quality_flag: 'MISSING_PRICE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.salePriceEur).toBeNull()
      expect(result.data.gainLossEur).toBeNull()
      expect(result.data.qualityFlag).toBe('MISSING_PRICE')
    }
  })

  it('rejects an unrecognised quality_flag', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: null,
      gain_loss_eur: null,
      operation_type: 'FEE',
      quality_flag: 'NOT_A_REAL_FLAG',
    })
    expect(result.success).toBe(false)
  })

  it('keeps the existing WALLET_ACTIVATION fiscal-classification flag intact', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 0,
      gain_loss_eur: 0,
      operation_type: 'FEE',
      flag: 'WALLET_ACTIVATION',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.flag).toBe('WALLET_ACTIVATION')
    }
  })

  it('rejects an unrecognised fiscal-classification flag', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 0,
      gain_loss_eur: 0,
      operation_type: 'FEE',
      flag: 'NOT_A_REAL_CLASSIFICATION',
    })
    expect(result.success).toBe(false)
  })

  it('parses a manual value_provenance as a typed union', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 2,
      gain_loss_eur: 0.5,
      operation_type: 'FEE',
      value_provenance: 'MANUAL',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.valueProvenance).toBe('MANUAL')
    }
  })

  it('rejects an unrecognised value_provenance', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 2,
      gain_loss_eur: 0.5,
      operation_type: 'FEE',
      value_provenance: 'GUESS',
    })
    expect(result.success).toBe(false)
  })

  it('still parses a genuine zero sale_price_eur as 0, not null', () => {
    const result = ExternalTaxLotHistorySchema.safeParse({
      ...base,
      sale_price_eur: 0,
      gain_loss_eur: 0,
      operation_type: 'SPEND',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.salePriceEur).toBe(0)
      expect(result.data.gainLossEur).toBe(0)
    }
  })
})

describe('ExternalTokenHistorySchema — the custody timeline arrives beside the disposals', () => {
  const RELOCATION = {
    id: 'tx-move-lot-1-ownwallet-XRP',
    occurred_at: '2024-03-01T10:00:00.000Z',
    qty: 50,
    from_account_id: 'kraken',
    from_account_name: 'Kraken',
    from_is_synthetic: false,
    to_account_id: 'ownwallet-XRP',
    to_account_name: 'ownwallet-XRP',
    to_is_synthetic: true,
  }

  it('maps a relocation onto the domain entity', () => {
    const result = ExternalTokenHistorySchema.safeParse({
      lots: [],
      history: {},
      relocations: { 'lot-1': [RELOCATION] },
    })

    expect(result.success).toBe(true)
    const move = result.data?.relocations['lot-1']?.[0]
    expect(move?.occurredAt).toBeInstanceOf(Date)
    expect(move?.qty).toBe(50)
    expect(move?.fromAccountName).toBe('Kraken')
    expect(move?.toIsSynthetic).toBe(true)
  })

  it('declares no valuation key on a relocation', () => {
    const result = ExternalTokenHistorySchema.safeParse({
      relocations: { 'lot-1': [RELOCATION] },
    })
    const move = result.data?.relocations['lot-1']?.[0]

    expect(Object.keys(move ?? {})).not.toContain('salePriceEur')
    expect(Object.keys(move ?? {})).not.toContain('gainLossEur')
    expect(Object.keys(move ?? {})).not.toContain('isTaxable')
  })

  it('defaults to no relocations rather than to undefined, so the view can iterate', () => {
    const result = ExternalTokenHistorySchema.safeParse({ lots: [], history: {} })

    expect(result.success).toBe(true)
    expect(result.data?.relocations).toEqual({})
  })

  it('rejects a relocation with no destination account', () => {
    const { to_account_id: _omitted, ...withoutDestination } = RELOCATION
    const result = ExternalTokenHistorySchema.safeParse({
      relocations: { 'lot-1': [withoutDestination] },
    })

    expect(result.success).toBe(false)
  })
})
