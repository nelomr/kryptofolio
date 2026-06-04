/**
 * Unit Tests — CexFuturesLedgerSchema (ExternalFuturesSchemas.ts)
 *
 * Spec coverage:
 *   - CexFuturesLedgerSchema: field mapping, type normalization, timestamp parsing
 *   - extractUnderlyingAsset: contract symbol parsing for various CEX formats
 *   - Error handling: safeParse failures, malformed inputs
 *
 * @see openspec/changes/refactor-tax-derivatives-table/design.md
 * @see src/core/infrastructure/dtos/ExternalFuturesSchemas.ts
 */

import { describe, it, expect } from 'vitest'
import {
  CexFuturesLedgerSchema,
  extractUnderlyingAsset,
} from '@/core/infrastructure/dtos/ExternalFuturesSchemas'

// ---------------------------------------------------------------------------
// extractUnderlyingAsset — contract symbol parsing
// ---------------------------------------------------------------------------

describe('extractUnderlyingAsset', () => {
  it('extracts asset from Kraken pf_ format (pf_xrpusd → xrp)', () => {
    expect(extractUnderlyingAsset('pf_xrpusd')).toBe('xrp')
  })

  it('extracts asset from Kraken pf_ format (pf_btcusd → btc)', () => {
    expect(extractUnderlyingAsset('pf_btcusd')).toBe('btc')
  })

  it('extracts asset from Kraken pi_ format (pi_ethusd → eth)', () => {
    expect(extractUnderlyingAsset('pi_ethusd')).toBe('eth')
  })

  it('extracts asset from Kraken ff_ format (ff_sol_usd → sol)', () => {
    expect(extractUnderlyingAsset('ff_sol_usd')).toBe('sol')
  })

  it('extracts asset from dash format (BTC-PERP → btc)', () => {
    expect(extractUnderlyingAsset('BTC-PERP')).toBe('btc')
  })

  it('extracts asset from BTCUSDT format (trailing USDT → btc)', () => {
    expect(extractUnderlyingAsset('BTCUSDT')).toBe('btc')
  })

  it('extracts asset from ETHEUR format (trailing EUR → eth)', () => {
    expect(extractUnderlyingAsset('ETHEUR')).toBe('eth')
  })

  it('returns lowercase original for unknown format', () => {
    expect(extractUnderlyingAsset('XYZ')).toBe('xyz')
  })

  it('returns generic for empty string', () => {
    expect(extractUnderlyingAsset('')).toBe('generic')
  })
})

// ---------------------------------------------------------------------------
// CexFuturesLedgerSchema — Kraken Futures trade
// ---------------------------------------------------------------------------

describe('CexFuturesLedgerSchema — FUTURES_TRADE', () => {
  it('parses a well-formed Kraken FUTURES_TRADE entry', () => {
    const raw = {
      id: 'dftx-001',
      type: 'futures_trade',
      symbol: 'pf_btcusd',
      change: '0.5',
      trade_price: '60000',
      realized_pnl: '2000',
      fee: '5.0',
      realized_funding: '0',
      timestamp: '2024-03-10T10:00:00Z',
      exchange: 'Kraken Futures',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('FUTURES_TRADE')
      expect(result.data.contractSymbol).toBe('pf_btcusd')
      expect(result.data.underlyingAsset).toBe('btc')
      expect(result.data.amount).toBe(0.5)
      expect(result.data.tradePrice).toBe(60000)
      expect(result.data.realizedPnl).toBe(2000)
      expect(result.data.fees).toBe(5)
      expect(result.data.funding).toBe(0)
      expect(result.data.timestamp).toBeInstanceOf(Date)
      expect(result.data.exchange).toBe('Kraken Futures')
      expect(result.data.status).toBe('CLOSED')
    }
  })

  it('parses a FUTURES_FUNDING entry', () => {
    const raw = {
      id: 'dftx-002',
      type: 'funding',
      symbol: 'pf_ethusd',
      change: '0',
      trade_price: '0',
      realized_pnl: '0',
      fee: '0',
      realized_funding: '-1.5',
      timestamp: '2024-03-10T16:00:00Z',
      status: 'SETTLED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('FUTURES_FUNDING')
      expect(result.data.funding).toBe(-1.5)
      expect(result.data.underlyingAsset).toBe('eth')
    }
  })

  it('maps CONVERSION type correctly', () => {
    const raw = {
      id: 'dftx-006',
      type: 'conversion',
      symbol: 'pf_btcusd',
      change: '1000',
      trade_price: '1',
      realized_pnl: '0',
      fee: '0.5',
      realized_funding: '0',
      timestamp: '2024-06-01T09:00:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('CONVERSION')
    }
  })

  it('defaults unknown types to UNKNOWN', () => {
    const raw = {
      id: 'dftx-unk',
      type: 'some_mystery_type',
      symbol: 'pf_btcusd',
      timestamp: '2024-01-01T00:00:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('UNKNOWN')
    }
  })

  it('coerces string numbers to numbers', () => {
    const raw = {
      id: 'dftx-str',
      type: 'futures_trade',
      symbol: 'pf_solusd',
      change: '100',
      trade_price: '150.50',
      realized_pnl: '-200.75',
      fee: '1.2',
      realized_funding: '3.5',
      timestamp: '2025-01-20T11:00:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.amount).toBe(100)
      expect(result.data.tradePrice).toBe(150.5)
      expect(result.data.realizedPnl).toBe(-200.75)
      expect(result.data.fees).toBe(1.2)
      expect(result.data.funding).toBe(3.5)
    }
  })

  it('accepts alternate field names (contract, fee_eur, pnl)', () => {
    const raw = {
      id: 'dftx-alt',
      type: 'trade',
      contract: 'pf_xrpusd',
      amount: '5000',
      price: '0.55',
      pnl: '800',
      fee_eur: '1.2',
      funding: '1.8',
      date: '2025-03-10T10:00:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contractSymbol).toBe('pf_xrpusd')
      expect(result.data.underlyingAsset).toBe('xrp')
      expect(result.data.realizedPnl).toBe(800)
      expect(result.data.fees).toBe(1.2)
      expect(result.data.funding).toBe(1.8)
    }
  })

  it('defaults numeric fields to 0 when missing', () => {
    const raw = {
      id: 'dftx-minimal',
      type: 'futures_trade',
      symbol: 'pf_btcusd',
      timestamp: '2024-01-01T00:00:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.realizedPnl).toBe(0)
      expect(result.data.fees).toBe(0)
      expect(result.data.funding).toBe(0)
    }
  })

  it('fails gracefully on missing required id (safeParse does not throw)', () => {
    const result = CexFuturesLedgerSchema.safeParse({ type: 'trade', symbol: 'pf_btcusd' })
    expect(result.success).toBe(false)
    expect(() => CexFuturesLedgerSchema.safeParse(null)).not.toThrow()
  })

  it('handles negative realizedPnl correctly (loss scenario)', () => {
    const raw = {
      id: 'dftx-loss',
      type: 'futures_trade',
      symbol: 'pf_ethusd',
      change: '10',
      trade_price: '3000',
      realized_pnl: '-500',
      fee: '2.5',
      realized_funding: '-0.8',
      timestamp: '2024-05-15T14:30:00Z',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.realizedPnl).toBe(-500)
      expect(result.data.funding).toBe(-0.8)
    }
  })
})
