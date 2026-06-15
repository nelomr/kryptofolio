import { describe, it, expect } from 'vitest'
import {
  guessColumnMapping,
  mapToEntity,
  validateRow,
} from '../columnAutoMapper'
import { normalizeToUtcIso } from '../dateNormalizer'
import type { TransactionRow } from '../../types'

describe('columnAutoMapper', () => {
  it('should correctly guess column mappings based on dictionary', () => {
    const headers = ['Fecha', 'Cantidad recibida', 'Moneda', 'Desconocido']
    const mapping = guessColumnMapping(headers)

    expect(mapping['Fecha']).toBe('date')
    expect(mapping['Cantidad recibida']).toBe('amount_in')
    expect(mapping['Moneda']).toBe('asset')
    expect(mapping['Desconocido']).toBe('metadata')
  })

  it('should correctly map an original row to a TransactionRow and preserve metadata', () => {
    const originalRow = {
      Fecha: '2023-12-01 15:30:00',
      Tipo: 'Buy',
      Cantidad: '500',
      Moneda: 'ETH',
      Exchange: 'Binance',
    }
    const mapping = {
      Fecha: 'date',
      Tipo: 'tx_type',
      Cantidad: 'amount_in',
      Moneda: 'asset_in',
      Exchange: 'metadata', // Unknown columns map to metadata
    }

    const row = mapToEntity(originalRow, mapping as Record<string, string | null>, 1)

    // Check mapped fields
    expect(row.mappedData.date).toBe('2023-12-01 15:30:00')
    expect(row.mappedData.tx_type).toBe('Buy')
    expect(row.mappedData.amount_in).toBe('500')
    expect(row.mappedData.asset_in).toBe('ETH')

    // Exchange is unmapped, so it goes to metadata
    expect(row.mappedData.metadata?.Exchange).toBe('Binance')
  })

  it('should mark row with errors if mapping fails to find required fields', () => {
    const originalRow = {
      Amount: '500',
      Asset: 'BTC',
    }
    const mapping = {
      Amount: 'amount',
      Asset: 'asset',
    }

    const row = mapToEntity(originalRow, mapping as Record<string, string | null>, 1)
    
    expect(row.mappedData.date).toBeUndefined()
    expect(row.hasError).toBe(true)
    // tx_type is missing, which causes a base validation error
    expect(row.errors.some(e => e.toLowerCase().includes('tx_type') || e.toLowerCase().includes('type'))).toBe(true)
    
    // Test the time superRefine specifically by providing tx_type but no date/timestamp
    const rowMissingTime = mapToEntity({
      Tipo: 'Buy',
      Amount: '500',
      Asset: 'BTC',
    }, {
      Tipo: 'tx_type',
      Amount: 'amount_in',
      Asset: 'asset_in',
    }, 2)
    
    expect(rowMissingTime.hasError).toBe(true)
    expect(rowMissingTime.errors.some(e => e.toLowerCase().includes('time') || e.toLowerCase().includes('date'))).toBe(true)
  })

  it('validateRow should flag missing financial fields', () => {
    // Has date and type, but NO financial info
    const rowWithoutFinancials: TransactionRow = {
      id: '2',
      hasError: false,
      errors: [],
      originalData: {},
      mappedData: {
        date: '2023-01-01',
        time: null,
        tx_type: 'buy',
        exchange: null,
        description: null,
        metadata: {}
      }
    }

    const validated = validateRow(rowWithoutFinancials)
    expect(validated.hasError).toBe(true)
    expect(validated.errors.some(e => e.includes('ingestion.errors.financial_data_missing'))).toBe(true)
    
    // With financials, it should pass
    const rowWithFinancials: TransactionRow = {
      id: '3',
      hasError: false,
      errors: [],
      originalData: {},
      mappedData: {
        date: '2023-01-01',
        time: null,
        tx_type: 'buy',
        amount_in: '1',
        asset_in: 'BTC',
        exchange: null,
        description: null,
        metadata: {}
      }
    }
    const validated2 = validateRow(rowWithFinancials)
    expect(validated2.hasError).toBe(false)
    expect(validated2.errors.length).toBe(0)
  })

  it('validateRow should differentiate Spot vs Futures correctly', () => {
    const baseRow: TransactionRow = {
      id: '4',
      hasError: false,
      errors: [],
      originalData: {},
      mappedData: {
        date: '2023-01-01',
        tx_type: 'trade',
        metadata: {}
      }
    }

    // FUTURES: Should fail if it's a Spot setup (amount_in + asset_in) in a Futures context,
    // actually, wait: Spot validation is generic or directional.
    // In Futures, it must be either Trade (amount + symbol + price_fiat + asset) OR PnL OR Funding.
    // A directional spot transfer like `amount_in` + `asset_in` will FAIL in Futures.
    const spotRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, amount_in: '1', asset_in: 'BTC' }
    }
    const validatedAsFutures = validateRow(spotRow as TransactionRow, 'FUTURES')
    expect(validatedAsFutures.hasError).toBe(true)

    // FUTURES: Trade success (amount + symbol + price_fiat + asset)
    const futuresTradeRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, amount: '10', symbol: 'pf_xrpusd', price_fiat: '0.5', asset: 'XRP' }
    }
    expect(validateRow(futuresTradeRow as TransactionRow, 'FUTURES').hasError).toBe(false)

    // FUTURES: PnL success (realized_pnl + fallback currency)
    const futuresPnlRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, realized_pnl: '10', quote_currency: 'USD' }
    }
    expect(validateRow(futuresPnlRow as TransactionRow, 'FUTURES').hasError).toBe(false)

    // FUTURES: Funding success (funding_amount + funding_currency)
    const futuresFundingRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, funding_amount: '-0.5', funding_currency: 'USD' }
    }
    expect(validateRow(futuresFundingRow as TransactionRow, 'FUTURES').hasError).toBe(false)

    // FUTURES: Fallback success (only symbol mapped, asset falls back to symbol)
    const futuresFallbackRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, amount: '10', symbol: 'pf_xrpusd', price_fiat: '0.5' }
    }
    expect(validateRow(futuresFallbackRow as TransactionRow, 'FUTURES').hasError).toBe(false)

    // FUTURES: Movement success (only amount and asset)
    const futuresMovementRow = {
      ...baseRow,
      mappedData: { ...baseRow.mappedData, amount: '100', asset: 'USD' }
    }
    expect(validateRow(futuresMovementRow as TransactionRow, 'FUTURES').hasError).toBe(false)
  })
})

describe('dateNormalizer', () => {
  it('should parse date when date and time are in a single space-separated dateStr', () => {
    const result = normalizeToUtcIso('2026-02-08 09:40:59', null, 'UTC')
    expect(result).toBe('2026-02-08T09:40:59.000Z')
  })

  it('should parse date and time when they are separate', () => {
    const result = normalizeToUtcIso('2026-02-08', '09:40:59', 'UTC')
    expect(result).toBe('2026-02-08T09:40:59.000Z')
  })

  it('should parse ISO date string directly', () => {
    const result = normalizeToUtcIso('2026-02-08T09:40:59.000Z', null, 'UTC')
    expect(result).toBe('2026-02-08T09:40:59.000Z')
  })

  it('should parse slash date format with space-separated time', () => {
    const result = normalizeToUtcIso('08/02/2026 09:40:59', null, 'UTC')
    expect(result).toBe('2026-02-08T09:40:59.000Z')
  })
})
