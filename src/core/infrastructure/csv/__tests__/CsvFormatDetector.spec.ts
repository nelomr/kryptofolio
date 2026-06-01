/**
 * CsvFormatDetector — Vitest unit tests (TDD red phase)
 * Tests that unknown formats throw TaxOperationError and
 * that detect() is correctly called across all registered parsers.
 *
 * @see openspec/changes/tax-domain-ports-services/specs/tax-operational-methods/spec.md
 */

import { describe, it, expect } from 'vitest'
import { REGISTERED_PARSERS } from '../index'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'

function detectFormat(headers: string[]) {
  return REGISTERED_PARSERS.find((p) => p.detect(headers))
}

describe('CsvFormatDetector — unknown headers', () => {
  it('all parsers return false for unknown headers', () => {
    const unknownHeaders = ['foo', 'bar', 'baz']
    const matched = REGISTERED_PARSERS.filter((p) => p.detect(unknownHeaders))
    expect(matched).toHaveLength(0)
  })

  it('detectFormat returns undefined for unknown headers', () => {
    expect(detectFormat(['foo', 'bar', 'baz'])).toBeUndefined()
  })

  it('TaxOperationError has code UPLOAD_FAILED', () => {
    const err = new TaxOperationError('UPLOAD_FAILED', 'Unsupported format')
    expect(err.code).toBe('UPLOAD_FAILED')
    expect(err.message).toBe('Unsupported format')
    expect(err).toBeInstanceOf(TaxOperationError)
  })
})

describe('CsvFormatDetector — Kraken Spot correctly identified', () => {
  it('returns Kraken parser for Kraken headers', () => {
    const headers = ['txid', 'refid', 'time', 'type', 'subtype', 'aclass', 'subclass', 'asset', 'wallet', 'amount', 'fee', 'balance']
    const matched = detectFormat(headers)
    expect(matched).toBeDefined()
    expect(matched!.constructor.name).toBe('KrakenSpotCsvParser')
  })
})

describe('CsvFormatDetector — Bitvavo correctly identified', () => {
  it('returns Bitvavo parser for Bitvavo headers', () => {
    const headers = ['Timezone', 'Date', 'Time', 'Type', 'Currency', 'Amount',
      'Quote Currency', 'Quote Price', 'Received / Paid Currency',
      'Received / Paid Amount', 'Fee currency', 'Fee amount', 'Status', 'Transaction ID', 'Address']
    const matched = detectFormat(headers)
    expect(matched).toBeDefined()
    expect(matched!.constructor.name).toBe('BitvavoCsvParser')
  })
})

describe('CsvFormatDetector — Bit2Me correctly identified', () => {
  it('returns Bit2Me parser for Bit2Me headers', () => {
    const headers = ['Tipo de operación', 'Cantidad de destino', 'Moneda de destino',
      'Cantidad de origen', 'Moneda de origen', 'Comisión de la operación']
    const matched = detectFormat(headers)
    expect(matched).toBeDefined()
    expect(matched!.constructor.name).toBe('Bit2MeXlsxParser')
  })
})
