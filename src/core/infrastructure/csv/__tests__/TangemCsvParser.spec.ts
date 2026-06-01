/**
 * TangemCsvParser — Vitest unit tests (TDD red phase)
 * Real sample rows derived from tangem_activacion_xrp.csv
 *
 * @see openspec/changes/tax-domain-ports-services/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { TangemCsvParser } from '../TangemCsvParser'

const parser = new TangemCsvParser()

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('TangemCsvParser.detect()', () => {
  it('returns true for Tangem headers', () => {
    const headers = ['Date', 'Type', 'Asset', 'Amount', 'Fee', 'Notes']
    expect(parser.detect(headers)).toBe(true)
  })

  it('returns false if Kraken-specific column is present', () => {
    // Kraken also has Date-like cols, but txid/refid/subclass identify it
    const headers = ['txid', 'refid', 'time', 'type', 'subclass', 'Notes']
    expect(parser.detect(headers)).toBe(false)
  })

  it('returns false for Bitvavo headers', () => {
    const headers = ['Date', 'Type', 'Currency', 'Quote Currency', 'Transaction ID', 'Notes']
    expect(parser.detect(headers)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parse() — WALLET_ACTIVATION → DEPOSIT with audit flag
// ---------------------------------------------------------------------------

describe('TangemCsvParser.parse() — WALLET_ACTIVATION', () => {
  const rawRows = [
    {
      Date: '2025-06-03 10:01:00 UTC',
      Type: 'WALLET_ACTIVATION',
      Asset: 'XRP',
      Amount: '1.0',
      Fee: '0.0',
      Notes: 'Tangem Base Reserve',
    },
  ]

  it('emits type DEPOSIT', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('DEPOSIT')
  })

  it('emits symbol XRP', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('XRP')
  })

  it('emits amount 1.0', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(1.0)
  })

  it('emits feeEur 0', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.feeEur).toBe(0)
  })

  it('has refId containing WALLET_ACTIVATION for audit traceability', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.refId).toContain('WALLET_ACTIVATION')
  })

  it('emits exchange Tangem', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.exchange).toBe('Tangem')
  })
})
