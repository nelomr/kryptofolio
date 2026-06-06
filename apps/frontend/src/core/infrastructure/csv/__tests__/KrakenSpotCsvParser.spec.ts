/**
 * KrakenSpotCsvParser — Vitest unit tests (TDD red phase)
 * Real sample rows derived from kraken_spot.csv
 *
 * @see openspec/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { KrakenSpotCsvParser } from '../KrakenSpotCsvParser'

const parser = new KrakenSpotCsvParser()

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.detect()', () => {
  it('returns true for Kraken Spot headers', () => {
    const headers = ['txid', 'refid', 'time', 'type', 'subtype', 'aclass', 'subclass', 'asset', 'wallet', 'amount', 'fee', 'balance']
    expect(parser.detect(headers)).toBe(true)
  })

  it('returns false for Bitvavo headers', () => {
    const headers = ['Timezone', 'Date', 'Time', 'Type', 'Currency', 'Amount', 'Quote Currency', 'Transaction ID']
    expect(parser.detect(headers)).toBe(false)
  })

  it('returns false for empty headers', () => {
    expect(parser.detect([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parse() — BUY pair (EUR negative, crypto positive)
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.parse() — BUY trade pair', () => {
  // Real rows from kraken_spot.csv: refid TTE7DJ-SLH4A-HWU24P
  const rawRows = [
    {
      txid: 'LASZIL-2N6LK-FPQMDU',
      refid: 'TTE7DJ-SLH4A-HWU24P',
      time: '2025-09-19 01:38:34',
      type: 'trade',
      subtype: 'tradespot',
      aclass: 'currency',
      subclass: 'fiat',
      asset: 'EUR',
      wallet: 'spot / main',
      amount: '-50.0000',
      fee: '0',
      balance: '0.0000',
    },
    {
      txid: 'LF7MEH-X4QM7-OPKE65',
      refid: 'TTE7DJ-SLH4A-HWU24P',
      time: '2025-09-19 01:38:34',
      type: 'trade',
      subtype: 'tradespot',
      aclass: 'currency',
      subclass: 'crypto',
      asset: 'PUMP',
      wallet: 'spot / main',
      amount: '7704.160',
      fee: '17.720',
      balance: '7686.440',
    },
  ]

  it('emits exactly 1 entity', () => {
    const result = parser.parse(rawRows)
    expect(result).toHaveLength(1)
  })

  it('entity has type BUY', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('BUY')
  })

  it('entity has symbol PUMP', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('PUMP')
  })

  it('entity has correct amount (crypto leg)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(7704.16)
  })

  it('entity has totalEur from EUR leg (absolute)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.totalEur).toBeCloseTo(50)
  })

  it('entity has feeEur from crypto leg fee (0 since fee is in PUMP)', () => {
    const [entity] = parser.parse(rawRows)
    // fee is in PUMP, not EUR — so feeEur = 0
    expect(entity.feeEur).toBe(0)
  })

  it('entity has exchange Kraken', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.exchange).toBe('Kraken')
  })

  it('entity has refId from refid column', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.refId).toBe('TTE7DJ-SLH4A-HWU24P')
  })
})

// ---------------------------------------------------------------------------
// parse() — SELL pair (EUR positive, crypto negative)
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.parse() — SELL trade pair', () => {
  // Rows from kraken_spot.csv: refid TKU627-44BLQ-5CPE3L
  const rawRows = [
    {
      txid: 'LDTRYG-IIHBP-3JDZJI',
      refid: 'TKU627-44BLQ-5CPE3L',
      time: '2025-10-07 23:40:26',
      type: 'trade',
      subtype: 'tradespot',
      aclass: 'currency',
      subclass: 'crypto',
      asset: 'ENA',
      wallet: 'spot / main',
      amount: '-957.64750',
      fee: '0',
      balance: '0.00000',
    },
    {
      txid: 'LW2GE4-BGT5H-RYWKGE',
      refid: 'TKU627-44BLQ-5CPE3L',
      time: '2025-10-07 23:40:26',
      type: 'trade',
      subtype: 'tradespot',
      aclass: 'currency',
      subclass: 'fiat',
      asset: 'EUR',
      wallet: 'spot / main',
      amount: '448.7536',
      fee: '1.7950',
      balance: '450.3978',
    },
  ]

  it('emits type SELL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('SELL')
  })

  it('emits symbol ENA (the crypto)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('ENA')
  })

  it('emits amount as positive crypto quantity', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(957.6475)
  })

  it('emits totalEur as EUR received (positive)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.totalEur).toBeCloseTo(448.7536)
  })

  it('emits feeEur from EUR leg fee', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.feeEur).toBeCloseTo(1.795)
  })
})

// ---------------------------------------------------------------------------
// parse() — single-row DEPOSIT (crypto)
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.parse() — DEPOSIT (crypto)', () => {
  const rawRows = [
    {
      txid: 'LBWJMS-SLRVN-7PTTTU',
      refid: 'FTRZofM-WCBx7AxdmMCxZL2FR0BqtT',
      time: '2025-09-16 13:15:40',
      type: 'deposit',
      subtype: '',
      aclass: 'currency',
      subclass: 'crypto',
      asset: 'HBAR',
      wallet: 'spot / main',
      amount: '5239.22090',
      fee: '0',
      balance: '5263.22090',
    },
  ]

  it('emits type DEPOSIT', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('DEPOSIT')
  })

  it('emits symbol HBAR', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('HBAR')
  })

  it('emits correct amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(5239.2209)
  })
})

// ---------------------------------------------------------------------------
// parse() — single-row WITHDRAWAL (crypto with fee)
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.parse() — WITHDRAWAL', () => {
  const rawRows = [
    {
      txid: 'LEYUHY-CLZ3G-BKQDT3',
      refid: 'FTkEI63-uLHFjQyuJjheYq18oDiN2K',
      time: '2025-11-10 15:48:07',
      type: 'withdrawal',
      subtype: '',
      aclass: 'currency',
      subclass: 'crypto',
      asset: 'SOL',
      wallet: 'spot / main',
      amount: '-0.0060000000',
      fee: '0.0050000000',
      balance: '0.0097713000',
    },
  ]

  it('emits type WITHDRAWAL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('WITHDRAWAL')
  })

  it('emits symbol SOL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('SOL')
  })

  it('emits amount as positive value', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(0.006)
  })
})

// ---------------------------------------------------------------------------
// parse() — TRANSFER to futures → TRANSFER_OUT
// ---------------------------------------------------------------------------

describe('KrakenSpotCsvParser.parse() — TRANSFER_OUT (spot-to-futures)', () => {
  const rawRows = [
    {
      txid: 'LKP7I5-DULS6-6XDQDC',
      refid: 'FTHwm6B-RkMQ20mb9KDTRCCRG0ZR4m',
      time: '2026-01-16 15:41:18',
      type: 'transfer',
      subtype: 'spottofutures',
      aclass: 'currency',
      subclass: 'fiat',
      asset: 'EUR',
      wallet: 'spot / main',
      amount: '-200.0000',
      fee: '0',
      balance: '2.5205',
    },
  ]

  it('emits type TRANSFER_OUT', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('TRANSFER_OUT')
  })

  it('emits symbol EUR', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('EUR')
  })

  it('emits amount as positive value', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(200)
  })
})
