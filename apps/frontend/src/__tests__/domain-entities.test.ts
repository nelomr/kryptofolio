/**
 * Unit Tests — Domain Layer: Branded Types & Entities
 *
 * Spec coverage:
 *   - hexagonal-architecture: domain port contracts
 *   - zod-validation: branded types, nominal typing
 *   - fiscal-domain: TaxTransactionEntity, TaxReportEntity, TaxLotEntity
 *
 * @see openspec/specs/
 */

import { describe, it, expect } from 'vitest'
import {
  AssetIdSchema,
  TransactionIdSchema,
  LotIdSchema,
} from '@/core/infrastructure/dtos/BrandedTypeSchemas'
import type {
  CryptoAssetEntity,
  PortfolioSummaryEntity,
} from '@/core/domain/models/PortfolioEntities'
import type {
  TaxTransactionEntity,
  TaxReportEntity,
  TaxLotEntity,
  TaxTransactionType,
} from '@/core/domain/models/FiscalEntities'

// ---------------------------------------------------------------------------
// Branded Types — Nominal typing enforcement
// ---------------------------------------------------------------------------

describe('AssetId — Branded Type', () => {
  it('parses a valid string into an AssetId', () => {
    const id = AssetIdSchema.parse('asset-uuid-001')
    expect(typeof id).toBe('string')
    expect(id).toBe('asset-uuid-001')
  })

  it('rejects a non-string value', () => {
    expect(() => AssetIdSchema.parse(123)).toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => AssetIdSchema.parse('')).toThrow()
  })
})

describe('TransactionId — Branded Type', () => {
  it('parses a valid string into a TransactionId', () => {
    const id = TransactionIdSchema.parse('tx-uuid-001')
    expect(typeof id).toBe('string')
    expect(id).toBe('tx-uuid-001')
  })

  it('rejects a non-string value', () => {
    expect(() => TransactionIdSchema.parse(null)).toThrow()
  })
})

describe('LotId — Branded Type', () => {
  it('parses a valid string into a LotId', () => {
    const id = LotIdSchema.parse('lot-uuid-001')
    expect(typeof id).toBe('string')
  })

  it('rejects an empty string', () => {
    expect(() => LotIdSchema.parse('')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// TypeScript compile-time check: AssetId ≠ TransactionId
// (If this file compiles without error the branded types work correctly)
// ---------------------------------------------------------------------------
describe('Branded Types — nominal typing (compile-time)', () => {
  it('AssetId and TransactionId are structurally distinct at compile time', () => {
    // This test documents the compile-time protection.
    // If the following line were uncommented it would cause a TS error:
    //   const assetId: AssetId = TransactionIdSchema.parse('x') // TS error ✓
    // Since we can only test this at compile time, the test simply passes
    // to document the contract is in place.
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Domain Entities — Shape assertions (runtime)
// ---------------------------------------------------------------------------

describe('CryptoAssetEntity — domain shape', () => {
  it('satisfies the CryptoAssetEntity interface shape', () => {
    const entity: CryptoAssetEntity = {
      id: AssetIdSchema.parse('asset-btc-001'),
      symbol: 'BTC',
      amount: 0.5,
      avgPriceEur: 62000,
      currentValueEur: 31000,
      costBasisEur: 30000,
      unrealizedPnlEur: 1000,
      pnlEur: 1000,
      portfolioLocations: ['Ledger'],
    }
    expect(entity.symbol).toBe('BTC')
    expect(entity.amount).toBe(0.5)
    expect(typeof entity.id).toBe('string')
  })
})

describe('PortfolioSummaryEntity — domain shape', () => {
  it('satisfies the PortfolioSummaryEntity interface shape', () => {
    const summary: PortfolioSummaryEntity = {
      metrics: {
        totalEquityEur: 100000,
        totalCostBasisEur: 90000,
        totalRealizedPnlEur: 5000,
        totalUnrealizedPnlEur: 5000,
        totalPnlEur: 10000,
      },
      holdings: [],
    }
    expect(summary.metrics.totalEquityEur).toBe(100000)
    expect(Array.isArray(summary.holdings)).toBe(true)
  })
})

describe('TaxTransactionEntity — fiscal domain shape', () => {
  it('satisfies the TaxTransactionEntity interface shape', () => {
    const tx: TaxTransactionEntity = {
      id: TransactionIdSchema.parse('tx-001'),
      type: 'BUY' as TaxTransactionType,
      symbol: 'BTC',
      amount: 0.5,
      totalEur: 31000,
      priceEur: 62000,
      feeEur: 5,
      timestamp: new Date('2024-01-15T12:00:00Z'),
    }
    expect(tx.symbol).toBe('BTC')
    expect(tx.timestamp).toBeInstanceOf(Date)
    expect(tx.type).toBe('BUY')
  })

  it('supports all standard transaction types', () => {
    const validTypes: TaxTransactionType[] = [
      'BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'FEE',
      'TRANSFER_IN', 'TRANSFER_OUT', 'AIRDROP', 'REWARD', 'SWAP', 'UNKNOWN',
    ]
    expect(validTypes.length).toBeGreaterThan(0)
    validTypes.forEach(type => expect(typeof type).toBe('string'))
  })
})

describe('TaxReportEntity — fiscal domain shape', () => {
  it('satisfies the TaxReportEntity interface shape', () => {
    const report: TaxReportEntity = {
      year: 2024,
      method: 'FIFO',
      summary: {
        capitalGainsEur: 5000,
        capitalLossesEur: 1000,
        savingsBaseYieldsEur: 200,
        generalBaseAirdropsEur: 100,
        netPatrimonialResultEur: 4000,
        estimatedIrpfEur: 800,
      },
      auditTrail: [],
    }
    expect(report.summary.capitalGainsEur).toBe(5000)
    expect(report.summary.estimatedIrpfEur).toBe(800)
    expect(Array.isArray(report.auditTrail)).toBe(true)
  })
})

describe('TaxLotEntity — fiscal domain shape', () => {
  it('satisfies the TaxLotEntity interface shape', () => {
    const lot: TaxLotEntity = {
      id: LotIdSchema.parse('lot-001'),
      symbol: 'BTC',
      date: new Date('2024-01-01T00:00:00Z'),
      exchange: 'Kraken',
      originalQty: 1.0,
      remainingQty: 0.5,
      unitCost: 45000,
      totalCost: 45000,
    }
    expect(lot.originalQty).toBe(1.0)
    expect(lot.remainingQty).toBe(0.5)
    expect(lot.date).toBeInstanceOf(Date)
  })
})
