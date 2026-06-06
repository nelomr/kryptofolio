/**
 * Bit2MeXlsxParser — Vitest unit tests (TDD red phase)
 * Sample rows based on the Bit2Me XLSX structure documented in:
 *   backend/src/domain/fiscal/parsers/bit2me.py
 *
 * Columns (positional): Tipo de operación | Cantidad de destino | Moneda de destino |
 *   Cantidad de origen | Moneda de origen | Comisión de la operación |
 *   Moneda de la comisión | Exchange | Grupo | Descripción | Fecha
 *
 * @see openspec/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { Bit2MeXlsxParser } from '../Bit2MeXlsxParser'

const parser = new Bit2MeXlsxParser()

// ---------------------------------------------------------------------------
// detect()
// ---------------------------------------------------------------------------

describe('Bit2MeXlsxParser.detect()', () => {
  it('returns true for Bit2Me headers', () => {
    const headers = ['Tipo de operación', 'Cantidad de destino', 'Moneda de destino',
      'Cantidad de origen', 'Moneda de origen', 'Comisión de la operación',
      'Moneda de la comisión', 'Exchange', 'Grupo', 'Descripción', 'Fecha']
    expect(parser.detect(headers)).toBe(true)
  })

  it('returns false for Kraken headers', () => {
    const headers = ['txid', 'refid', 'time', 'type', 'subclass', 'asset', 'amount']
    expect(parser.detect(headers)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parse() — BUY (EUR → Crypto: trade type)
// ---------------------------------------------------------------------------

describe('Bit2MeXlsxParser.parse() — BUY (EUR → Crypto)', () => {
  const rawRows = [
    {
      'Tipo de operación': 'trade',
      'Cantidad de destino': '0.005',
      'Moneda de destino': 'BTC',
      'Cantidad de origen': '250',
      'Moneda de origen': 'EUR',
      'Comisión de la operación': '1.25',
      'Moneda de la comisión': 'EUR',
      Exchange: 'Bit2Me',
      Grupo: '',
      Descripción: '',
      Fecha: '2024-03-15 10:00:00',
    },
  ]

  it('emits type BUY', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('BUY')
  })

  it('emits symbol BTC (destination crypto)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('BTC')
  })

  it('emits amount as destination quantity', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(0.005)
  })

  it('emits totalEur as source EUR amount', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.totalEur).toBeCloseTo(250)
  })

  it('emits feeEur correctly (fee in EUR)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.feeEur).toBeCloseTo(1.25)
  })

  it('emits exchange Bit2Me', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.exchange).toBe('Bit2Me')
  })
})

// ---------------------------------------------------------------------------
// parse() — SELL (Crypto → EUR: trade type, reversed direction)
// ---------------------------------------------------------------------------

describe('Bit2MeXlsxParser.parse() — SELL (Crypto → EUR)', () => {
  const rawRows = [
    {
      'Tipo de operación': 'trade',
      'Cantidad de destino': '300',
      'Moneda de destino': 'EUR',
      'Cantidad de origen': '0.1',
      'Moneda de origen': 'ETH',
      'Comisión de la operación': '1.5',
      'Moneda de la comisión': 'EUR',
      Exchange: 'Bit2Me',
      Grupo: '',
      Descripción: '',
      Fecha: '2024-06-20 14:00:00',
    },
  ]

  it('emits type SELL', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('SELL')
  })

  it('emits symbol ETH (origin crypto)', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('ETH')
  })

  it('emits amount as origin quantity', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(0.1)
  })

  it('emits totalEur as destination EUR', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.totalEur).toBeCloseTo(300)
  })
})

// ---------------------------------------------------------------------------
// parse() — SWAP (Crypto → Crypto: emits SELL + BUY)
// ---------------------------------------------------------------------------

describe('Bit2MeXlsxParser.parse() — SWAP (Crypto → Crypto)', () => {
  const rawRows = [
    {
      'Tipo de operación': 'swap',
      'Cantidad de destino': '0.3',
      'Moneda de destino': 'SOL',
      'Cantidad de origen': '0.05',
      'Moneda de origen': 'ETH',
      'Comisión de la operación': '0.5',
      'Moneda de la comisión': 'EUR',
      Exchange: 'Bit2Me',
      Grupo: '',
      Descripción: '',
      Fecha: '2025-01-10 09:00:00',
    },
  ]

  it('emits 2 entities (SELL + BUY)', () => {
    const result = parser.parse(rawRows)
    expect(result).toHaveLength(2)
  })

  it('first entity is SELL of ETH', () => {
    const [sell] = parser.parse(rawRows)
    expect(sell.type).toBe('SELL')
    expect(sell.symbol).toBe('ETH')
  })

  it('second entity is BUY of SOL', () => {
    const [, buy] = parser.parse(rawRows)
    expect(buy.type).toBe('BUY')
    expect(buy.symbol).toBe('SOL')
  })

  it('fee is assigned to the SELL entity', () => {
    const [sell] = parser.parse(rawRows)
    expect(sell.feeEur).toBeCloseTo(0.5)
  })

  it('BUY entity has zero fee (fee charged on SELL side)', () => {
    const [, buy] = parser.parse(rawRows)
    expect(buy.feeEur).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// parse() — REWARD (staking)
// ---------------------------------------------------------------------------

describe('Bit2MeXlsxParser.parse() — REWARD (staking)', () => {
  const rawRows = [
    {
      'Tipo de operación': 'staking',
      'Cantidad de destino': '25.5',
      'Moneda de destino': 'B2M',
      'Cantidad de origen': '0',
      'Moneda de origen': '',
      'Comisión de la operación': '0',
      'Moneda de la comisión': '',
      Exchange: 'Bit2Me',
      Grupo: '',
      Descripción: 'Staking reward',
      Fecha: '2025-04-01 12:00:00',
    },
  ]

  it('emits type REWARD', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.type).toBe('REWARD')
  })

  it('emits symbol B2M', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.symbol).toBe('B2M')
  })

  it('emits amount 25.5', () => {
    const [entity] = parser.parse(rawRows)
    expect(entity.amount).toBeCloseTo(25.5)
  })
})
