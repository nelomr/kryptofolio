/**
 * BitUnixCsvParser — Vitest unit tests (TDD red phase)
 * Real sample rows derived from bitunix_spot.csv
 *
 * @see openspec/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { BitUnixCsvParser } from '../BitUnixCsvParser'

const parser = new BitUnixCsvParser()

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('BitUnixCsvParser.detect()', () => {
  it('returns true for BitUnix headers', () => {
    const headers = ['Date (UTC)', 'Label', 'Outgoing Asset', 'Outgoing Amount',
      'Incoming Asset', 'Incoming Amount', 'Fee Asset', 'Fee Amount', 'Trx. ID', 'Comment']
    expect(parser.detect(headers)).toBe(true)
  })

  it('returns false for Kraken headers', () => {
    const headers = ['txid', 'refid', 'time', 'type', 'subclass', 'asset', 'amount']
    expect(parser.detect(headers)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parse() — DEPOSIT (ADA)
// ---------------------------------------------------------------------------

describe('BitUnixCsvParser.parse() — DEPOSIT', () => {
  const rawRows = [
    {
      'Date (UTC)': '2025-12-13 12:18:14',
      Label: 'Deposit',
      'Outgoing Asset': '',
      'Outgoing Amount': '0',
      'Incoming Asset': 'ADA',
      'Incoming Amount': '543.344684',
      'Fee Asset': '',
      'Fee Amount': '0',
      'Trx. ID': 'T0009',
      Comment: 'Chain Deposit',
    },
  ]

  it('emits type DEPOSIT', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('DEPOSIT')
  })

  it('emits symbol ADA', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('ADA')
  })

  it('emits correct amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(543.344684)
  })

  it('emits exchange BitUnix', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.exchange).toBe('BitUnix')
  })
})

// ---------------------------------------------------------------------------
// parse() — WITHDRAWAL (ADA with fee)
// ---------------------------------------------------------------------------

describe('BitUnixCsvParser.parse() — WITHDRAWAL with fee', () => {
  const rawRows = [
    {
      'Date (UTC)': '2025-12-13 22:03:31',
      Label: 'Withdraw',
      'Outgoing Asset': 'ADA',
      'Outgoing Amount': '546.844684',
      'Incoming Asset': '',
      'Incoming Amount': '0',
      'Fee Asset': 'ADA',
      'Fee Amount': '1',
      'Trx. ID': 'T0010',
      Comment: 'On-chain Withdraw',
    },
  ]

  it('emits type WITHDRAWAL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('WITHDRAWAL')
  })

  it('emits symbol ADA', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('ADA')
  })

  it('emits correct amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(546.844684)
  })

  it('emits feeEur 0 (fee is in ADA, not EUR)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.feeEur).toBe(0)
  })
})
