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
import { Money } from '@kryptofolio/core-domain'
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
// CexFuturesLedgerSchema — against the real emitter, `LedgerFuturesTransaction`
//
// The route this schema parses (`/api/tax/transactions/futures`) serves
// `SQLiteLedgerAdapter.ts:240-257`'s object verbatim. Every case below is that
// literal shape — snake_case keys, the emitter's own optionality — not an
// invented CEX-ledger shape.
// ---------------------------------------------------------------------------

describe('CexFuturesLedgerSchema — against LedgerFuturesTransaction, the real emitter', () => {
  it('parses the emitter shape and populates every entity field the row carries', () => {
    // Exactly as SQLiteLedgerAdapter.ts:240-257 constructs it.
    const raw = {
      id: 'ftx-001',
      id_hash: 'hash-001',
      account_id: 'acc-1',
      exchange: 'Kraken Futures',
      tx_type: 'TRADE',
      symbol: 'pf_btcusd',
      amount: '0.5',
      trade_price: '60000',
      realized_pnl: '2000',
      funding_amount: '-1.5',
      fee_amount: '5.0',
      fiat_currency: 'EUR',
      timestamp: '2024-03-10T10:00:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.contractSymbol).toBe('pf_btcusd')
    expect(result.data.underlyingAsset).toBe('btc')
    expect(result.data.type).toBe('FUTURES_TRADE')
    expect(result.data.amount?.equals(new Money('0.5'))).toBe(true)
    expect(result.data.tradePrice?.equals(new Money('60000'))).toBe(true)
    expect(result.data.realizedPnl?.equals(new Money('2000'))).toBe(true)
    // These are the assertions that must be watched red first: today's schema
    // never reads `fee_amount`/`funding_amount`, so `fees`/`funding` come back
    // `0` while `success` is `true` — a bare `expect(success).toBe(true)`
    // would pass today and hide it.
    expect(result.data.fees?.equals(new Money('5.0'))).toBe(true)
    expect(result.data.funding?.equals(new Money('-1.5'))).toBe(true)
    expect(result.data.timestamp).toBeInstanceOf(Date)
    expect(result.data.exchange).toBe('Kraken Futures')
    expect(result.data.status).toBe('CLOSED')
  })

  it('parses a FUNDING_FEE row with no position size and no execution price on the wire', () => {
    // The emitter's spelling is `FUNDING_FEE`; the entity's is `FUTURES_FUNDING`.
    // `row.x ? … : undefined` makes absence reachable on the wire, and all five carriers are
    // `Money | null` — absence must map to `null`, never to `Money('0')`.
    const raw = {
      id: 'ftx-002',
      id_hash: 'hash-002',
      account_id: 'acc-1',
      tx_type: 'FUNDING_FEE',
      symbol: 'pf_ethusd',
      fiat_currency: 'EUR',
      timestamp: '2024-03-10T16:00:00Z',
      status: 'SETTLED',
      // amount, trade_price, realized_pnl, funding_amount, fee_amount: absent
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.type).toBe('FUTURES_FUNDING')
    expect(result.data.amount).toBeNull()
    expect(result.data.tradePrice).toBeNull()
    expect(result.data.realizedPnl).toBeNull()
    expect(result.data.funding).toBeNull()
    expect(result.data.fees).toBeNull()
  })

  it('preserves a stated zero as Money("0"), not as null, on a resolved fee', () => {
    const raw = {
      id: 'ftx-003',
      id_hash: 'hash-003',
      account_id: 'acc-1',
      tx_type: 'TRADE',
      symbol: 'pf_btcusd',
      amount: '1',
      fee_amount: '0',
      fiat_currency: 'EUR',
      timestamp: '2024-03-10T16:00:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.fees).not.toBeNull()
    expect(result.data.fees?.equals(new Money('0'))).toBe(true)
  })

  it('preserves exact precision past the float boundary for realizedPnl', () => {
    const raw = {
      id: 'ftx-004',
      id_hash: 'hash-004',
      account_id: 'acc-1',
      tx_type: 'TRADE',
      symbol: 'pf_btcusd',
      realized_pnl: '0.000000010000000001',
      fiat_currency: 'EUR',
      timestamp: '2024-03-10T16:00:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.realizedPnl?.equals(new Money('0.000000010000000001'))).toBe(true)
  })

  it.each([
    ['TRADE', 'FUTURES_TRADE'],
    ['FUNDING_FEE', 'FUTURES_FUNDING'],
    ['SETTLEMENT', 'FUTURES_SETTLEMENT'],
    ['LIQUIDATION', 'FUTURES_LIQUIDATION'],
  ])('maps emitter tx_type %s to entity type %s', (txType, entityType) => {
    const raw = {
      id: `ftx-${txType}`,
      id_hash: `hash-${txType}`,
      account_id: 'acc-1',
      tx_type: txType,
      symbol: 'pf_btcusd',
      fiat_currency: 'EUR',
      timestamp: '2024-03-10T10:00:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe(entityType)
    }
  })

  it('rejects an off-vocabulary tx_type rather than admitting it as UNKNOWN', () => {
    const raw = {
      id: 'ftx-bad',
      id_hash: 'hash-bad',
      account_id: 'acc-1',
      tx_type: 'SOME_MYSTERY_TYPE',
      symbol: 'pf_btcusd',
      fiat_currency: 'EUR',
      timestamp: '2024-01-01T00:00:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it('fails gracefully on missing required id (safeParse does not throw)', () => {
    const result = CexFuturesLedgerSchema.safeParse({ tx_type: 'TRADE', symbol: 'pf_btcusd' })
    expect(result.success).toBe(false)
    expect(() => CexFuturesLedgerSchema.safeParse(null)).not.toThrow()
  })

  it('handles negative realizedPnl correctly (loss scenario)', () => {
    const raw = {
      id: 'ftx-loss',
      id_hash: 'hash-loss',
      account_id: 'acc-1',
      tx_type: 'TRADE',
      symbol: 'pf_ethusd',
      amount: '10',
      trade_price: '3000',
      realized_pnl: '-500',
      fee_amount: '2.5',
      funding_amount: '-0.8',
      fiat_currency: 'EUR',
      timestamp: '2024-05-15T14:30:00Z',
      status: 'CLOSED',
    }
    const result = CexFuturesLedgerSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.realizedPnl?.equals(new Money('-500'))).toBe(true)
      expect(result.data.funding?.equals(new Money('-0.8'))).toBe(true)
    }
  })
})

