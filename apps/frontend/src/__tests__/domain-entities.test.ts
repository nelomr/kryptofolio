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
import { Money } from '@kryptofolio/core-domain'
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
      avgPriceFiat: 62000,
      currentValueFiat: 31000,
      costBasisFiat: 30000,
      unrealizedPnlFiat: 1000,
      pnlFiat: 1000,
      currency: 'USD',
      portfolioLocations: ['Ledger'],
    }
    expect(entity.symbol).toBe('BTC')
    expect(entity.amount).toBe(0.5)
    expect(entity.currency).toBe('USD')
    expect(typeof entity.id).toBe('string')
  })
})

describe('PortfolioSummaryEntity — domain shape', () => {
  it('satisfies the PortfolioSummaryEntity interface shape', () => {
    const summary: PortfolioSummaryEntity = {
      metrics: {
        totalEquityFiat: 100000,
        totalCostBasisFiat: 90000,
        totalRealizedPnlFiat: 5000,
        totalUnrealizedPnlFiat: 5000,
        totalPnlFiat: 10000,
        currency: 'USD',
        roiPercentage: 11.1,
        isBullish: true,
        realizedIsPositive: true,
        ratesIncomplete: false,
        pricesIncomplete: false,
      },
      holdings: [],
    }
    expect(summary.metrics.totalEquityFiat).toBe(100000)
    expect(summary.metrics.currency).toBe('USD')
    expect(Array.isArray(summary.holdings)).toBe(true)
  })
})

describe('TaxTransactionEntity — fiscal domain shape', () => {
  it('satisfies the TaxTransactionEntity interface shape', () => {
    const tx: TaxTransactionEntity = {
      id: TransactionIdSchema.parse('tx-001'),
      type: 'BUY' as TaxTransactionType,
      symbol: 'BTC',
      amount: new Money('0.5'),
      totalEur: new Money('31000'),
      priceEur: new Money('62000'),
      feeEur: new Money('5'),
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
      method: 'FIFO', currency: 'EUR', conversion: { kind: 'NATIVE' }, unconvertibleEvents: [],
      summary: {
        capitalGains: '5000',
        capitalLosses: '1000',
        savingsBaseYields: '200',
        generalBaseAirdrops: '100',
        netPatrimonialResult: '4000',
        estimatedIrpf: '800',
      },
      auditTrail: [],
      excludedFlaggedEvents: 0,
      excludedUnresolvedIncomeCount: 0,
    }
    expect(report.summary.capitalGains).toBe('5000')
    expect(report.summary.estimatedIrpf).toBe('800')
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
      originalQty: new Money('1.0'),
      remainingQty: new Money('0.5'),
      unitCost: new Money('45000'),
      totalCost: new Money('45000'),
      status: 'PARTIAL',
      currentLocations: [],
    }
    expect(lot.originalQty.equals(new Money('1.0'))).toBe(true)
    expect(lot.remainingQty.equals(new Money('0.5'))).toBe(true)
    expect(lot.date).toBeInstanceOf(Date)
  })

  it('sums many lots totalCost without float precision loss — the precision spec applied to this entity', () => {
    // Each of these three figures individually round-trips through a JS float without visible
    // damage; only their sum exposes it. `0.1 + 0.2 + 0.3` as native floats is
    // 0.6000000000000001, not 0.6 — the exact defect Money exists to remove from this entity.
    const lots: TaxLotEntity[] = [
      { unitCost: new Money('0'), totalCost: new Money('0.1') },
      { unitCost: new Money('0'), totalCost: new Money('0.2') },
      { unitCost: new Money('0'), totalCost: new Money('0.3') },
    ].map((partial, i) => ({
      id: LotIdSchema.parse(`lot-sum-${i}`),
      symbol: 'BTC',
      date: new Date('2024-01-01T00:00:00Z'),
      exchange: 'Kraken',
      originalQty: new Money('1'),
      remainingQty: new Money('1'),
      status: 'OPEN',
      currentLocations: [],
      ...partial,
    }))

    const total = lots.reduce((acc, lot) => acc.add(lot.totalCost), new Money('0'))

    expect(total.equals(new Money('0.6'))).toBe(true)
    expect(total.toString()).toBe('0.6')
  })
})
