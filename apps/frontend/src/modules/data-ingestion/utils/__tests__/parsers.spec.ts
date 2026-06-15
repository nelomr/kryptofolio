import { describe, it, expect } from 'vitest'
import { processRawRows } from '../parsers'

describe('processRawRows', () => {
  it('should correctly identify headers and map data', () => {
    const rawRows = [
      ['Trash data', 'More trash'],
      ['Date', 'Amount', 'Ticker'], // Row with most cols (3) -> Header
      ['2023-01-01', '100', 'BTC'],
      ['2023-01-02', '200', 'ETH']
    ]

    const result = processRawRows(rawRows)

    expect(result.errors).toEqual([])
    expect(result.headers).toEqual(['Date', 'Amount', 'Ticker'])
    expect(result.data.length).toBe(2)
    expect(result.data[0]).toEqual({ Date: '2023-01-01', Amount: '100', Ticker: 'BTC' })
    expect(result.data[1]).toEqual({ Date: '2023-01-02', Amount: '200', Ticker: 'ETH' })
  })

  it('should skip empty rows within the data', () => {
    const rawRows = [
      ['Date', 'Amount'],
      ['2023-01-01', '100'],
      ['', ''], // Empty row
      [null, undefined], // Empty row
      ['2023-01-03', '300']
    ]

    const result = processRawRows(rawRows)

    expect(result.data.length).toBe(2)
    expect(result.data[1]).toEqual({ Date: '2023-01-03', Amount: '300' })
  })

  it('should handle empty input gracefully', () => {
    expect(processRawRows([])).toEqual({ data: [], headers: [], errors: ['ingestion.errors.no_valid_data'] })
    expect(processRawRows([[], []])).toEqual({ data: [], headers: [], errors: ['ingestion.errors.no_valid_data'] })
  })
})
