/**
 * BitvavoCsvParser — Vitest unit tests (TDD red phase)
 * Real sample rows derived from bitvavo_spot.csv
 *
 * @see openspec/changes/tax-domain-ports-services/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { BitvavoCsvParser } from '../BitvavoCsvParser'

const parser = new BitvavoCsvParser()

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('BitvavoCsvParser.detect()', () => {
  it('returns true for Bitvavo headers', () => {
    const headers = ['Timezone', 'Date', 'Time', 'Type', 'Currency', 'Amount',
      'Quote Currency', 'Quote Price', 'Received / Paid Currency',
      'Received / Paid Amount', 'Fee currency', 'Fee amount', 'Status', 'Transaction ID', 'Address']
    expect(parser.detect(headers)).toBe(true)
  })

  it('returns false for Kraken headers', () => {
    const headers = ['txid', 'refid', 'time', 'type', 'subclass', 'asset', 'amount']
    expect(parser.detect(headers)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parse() — BUY (ETH buy with EUR, real row)
// ---------------------------------------------------------------------------

describe('BitvavoCsvParser.parse() — BUY', () => {
  const rawRows = [
    {
      Timezone: 'Europe/Madrid',
      Date: '2026-02-05',
      Time: '16:29:01.408',
      Type: 'buy',
      Currency: 'ETH',
      Amount: '0.30338',
      'Quote Currency': 'EUR',
      'Quote Price': '1645',
      'Received / Paid Currency': 'EUR',
      'Received / Paid Amount': '-499.81',
      'Fee currency': 'EUR',
      'Fee amount': '0.7499',
      Status: 'Completed',
      'Transaction ID': 'a00b3738-8d5e-4cee-b074-33a3d074ff77',
      Address: '',
    },
  ]

  it('emits type BUY', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('BUY')
  })

  it('emits symbol ETH', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('ETH')
  })

  it('emits correct amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(0.30338)
  })

  it('emits totalEur as absolute of Received/Paid Amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.totalEur).toBeCloseTo(499.81)
  })

  it('emits feeEur correctly', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.feeEur).toBeCloseTo(0.7499)
  })

  it('emits exchange Bitvavo', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.exchange).toBe('Bitvavo')
  })
})

// ---------------------------------------------------------------------------
// parse() — WITHDRAWAL (XRP)
// ---------------------------------------------------------------------------

describe('BitvavoCsvParser.parse() — WITHDRAWAL', () => {
  const rawRows = [
    {
      Timezone: 'Europe/Madrid',
      Date: '2026-02-07',
      Time: '10:19:39',
      Type: 'withdrawal',
      Currency: 'XRP',
      Amount: '-439.55',
      'Quote Currency': '',
      'Quote Price': '',
      'Received / Paid Currency': '',
      'Received / Paid Amount': '',
      'Fee currency': 'XRP',
      'Fee amount': '0',
      Status: 'Completed',
      'Transaction ID': '5a68d802-7105-46d9-b314-8fd5fbd731f8',
      Address: 'rp6huNdpgV7jKTnkiH5ZtmNJn5mezrLtcw',
    },
  ]

  it('emits type WITHDRAWAL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('WITHDRAWAL')
  })

  it('emits symbol XRP', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('XRP')
  })

  it('emits amount as positive value', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(439.55)
  })
})

// ---------------------------------------------------------------------------
// parse() — REWARD (campaign_new_user_incentive)
// ---------------------------------------------------------------------------

describe('BitvavoCsvParser.parse() — REWARD (campaign incentive)', () => {
  const rawRows = [
    {
      Timezone: 'Europe/Madrid',
      Date: '2025-09-30',
      Time: '10:10:36',
      Type: 'campaign_new_user_incentive',
      Currency: 'EUR',
      Amount: '10',
      'Quote Currency': '',
      'Quote Price': '',
      'Received / Paid Currency': '',
      'Received / Paid Amount': '',
      'Fee currency': '',
      'Fee amount': '',
      Status: 'Completed',
      'Transaction ID': '616fb4b8-dc68-4591-8ef3-42a902093585',
      Address: '',
    },
  ]

  it('emits type REWARD', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('REWARD')
  })

  it('emits symbol EUR', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('EUR')
  })

  it('emits amount 10', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(10)
  })
})
