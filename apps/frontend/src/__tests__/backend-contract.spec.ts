/**
 * Backend contract test (task 11.12).
 *
 * `zod-schemas.test.ts` has 15 tests and constructs every one of its own inputs — schema and
 * fixture written by the same hand, agreeing with each other regardless of what the backend
 * actually sends. That is why the frontend suite reported 271 passing tests while the status
 * vocabulary had drifted and `numericField` was fabricating zeros (D26/D27).
 *
 * This file validates the consumed endpoints against the backend's own DTO/use-case types —
 * type-only imports, erased at build time, so no backend runtime code executes — rather than
 * against a fixture this file invented independently. Building the first version of this test
 * caught a real drift: `ExternalTaxLotSchema` had declared the custody wire field as
 * `current_locations`; the backend's `TokenLotDto.custody` is the real name. Fixed in the same
 * commit as this file, and left as the demonstration that the method works.
 */
import { describe, it, expect } from 'vitest'
import type { TokenLotDto, TokenLotHistoryEventDto, GetTokenHistoryResponse } from '@kryptofolio/backend/src/core/application/use-cases/GetTokenHistoryUseCase.js'
import type { SpanishTaxReportResponse, TaxReportAuditTrailEventDto } from '@kryptofolio/backend/src/core/application/use-cases/GetSpanishTaxReportUseCase.js'
import {
  ExternalTokenHistorySchema,
  ExternalTaxReportSchema,
  ExternalTaxLotShape,
  ExternalTaxLotHistoryShape,
} from '@/core/infrastructure/dtos/ExternalTaxSchemas'

describe('Backend contract — canonical status vocabulary', () => {
  it('parses OPEN/PARTIAL/CLOSED from a payload shaped like GetTokenHistoryResponse', () => {
    const openLot: TokenLotDto = {
      id: 'lot-1', symbol: 'XRP', date: '2024-01-01', exchange: 'Kraken',
      original_qty: 179.11, remaining_qty: 179.11, unit_cost: 1.6724, total_cost: 299.46,
      status: 'OPEN', custody: [],
    }
    const closedLot: TokenLotDto = { ...openLot, id: 'lot-2', status: 'CLOSED', remaining_qty: 0 }
    const backendResponse: GetTokenHistoryResponse = { lots: [openLot, closedLot], history: {} }

    const result = ExternalTokenHistorySchema.safeParse(backendResponse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lots.map((l) => l.status)).toEqual(['OPEN', 'CLOSED'])
    }
  })

  it('rejects the retired FULL/EMPTY vocabulary even if a caller still sends it', () => {
    // Deliberately NOT typed as TokenLotDto — this is the payload the retired vocabulary would
    // have produced, and it must fail against the real backend type's status union.
    const staleLot = {
      id: 'lot-1', symbol: 'XRP', date: '2024-01-01', exchange: 'Kraken',
      original_qty: 100, remaining_qty: 100, unit_cost: 1, total_cost: 100,
      status: 'FULL', custody: [],
    }
    const result = ExternalTokenHistorySchema.safeParse({ lots: [staleLot], history: {} })
    expect(result.success).toBe(false)
  })
})

describe('Backend contract — a nullable field survives the round trip', () => {
  it('preserves a null sale_price_eur from a payload shaped like TokenLotHistoryEventDto', () => {
    const event: TokenLotHistoryEventDto = {
      id: 'evt-1', disposal_date: '2024-06-01', amount_from_lot: 0.2,
      sale_price_eur: null, gain_loss_eur: null, is_taxable: false,
      quality_flag: 'MISSING_PRICE', operation_type: 'FEE',
    }
    const result = ExternalTokenHistorySchema.safeParse({ lots: [], history: { 'lot-1': [event] } })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsedEvent = result.data.history['lot-1'][0]
      expect(parsedEvent.salePriceEur).toBeNull()
      expect(parsedEvent.gainLossEur).toBeNull()
      // The regression this test exists to prevent: a coercion turning the above into 0.
      expect(parsedEvent.salePriceEur).not.toBe(0)
    }
  })

  it('preserves a null sale_price_eur in the tax report audit trail too', () => {
    const auditRow: TaxReportAuditTrailEventDto = {
      id: 'evt-1', disposal_date: '2024-06-01', amount_from_lot: '0.2',
      sale_price_eur: null, gain_loss_eur: null, sale_fee_eur: 0, is_taxable: false,
      operation_type: 'FEE',
    }
    const backendResponse: SpanishTaxReportResponse = {
      year: 2024, method: 'FIFO', spotCapitalGains: '0', savingsBaseYields: '0',
      generalBaseAirdrops: '0', excludedFlaggedEvents: 1, manuallyAssignedCount: 0,
      summary: {
        capital_gains_eur: 0, capital_losses_eur: 0, savings_base_yields_eur: 0,
        general_base_airdrops_eur: 0, net_patrimonial_result_eur: 0, estimated_irpf_eur: 0,
      },
      audit_trail: [auditRow],
    }

    const result = ExternalTaxReportSchema.safeParse(backendResponse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.auditTrail[0].salePriceEur).toBeNull()
    }
  })
})

describe('Backend contract — a backend field with no frontend counterpart is caught', () => {
  it('ExternalTaxLotShape declares every key TokenLotDto sends', () => {
    const sample: TokenLotDto = {
      id: 'x', symbol: 'BTC', date: '2024-01-01', exchange: 'Kraken',
      original_qty: 1, remaining_qty: 1, unit_cost: 1, total_cost: 1,
      status: 'OPEN', custody: [],
    }
    const backendKeys = Object.keys(sample).sort()
    const declaredKeys = Object.keys(ExternalTaxLotShape.shape).sort()

    // If TokenLotDto gains a field, `sample` above fails to compile until it is added here —
    // that is the primary guard. This assertion is the secondary, runtime one: every key the
    // backend type actually carries must have a matching declaration in the frontend schema.
    for (const key of backendKeys) {
      expect(declaredKeys).toContain(key)
    }
  })

  it('ExternalTaxLotHistoryShape declares every key TokenLotHistoryEventDto sends', () => {
    const sample: TokenLotHistoryEventDto = {
      id: 'evt-1', disposal_date: '2024-06-01', amount_from_lot: 1,
      sale_price_eur: 1, gain_loss_eur: 1, is_taxable: true, operation_type: 'SELL',
    }
    const backendKeys = Object.keys(sample).sort()
    const declaredKeys = Object.keys(ExternalTaxLotHistoryShape.shape).sort()

    for (const key of backendKeys) {
      expect(declaredKeys).toContain(key)
    }
  })
})
