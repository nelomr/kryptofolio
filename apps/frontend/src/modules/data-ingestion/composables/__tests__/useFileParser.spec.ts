import { describe, it, expect, vi } from 'vitest'
import { useFileParser } from '../useFileParser'
import * as parsers from '../../utils/parsers'

vi.mock('../../utils/parsers', () => ({
  parseCsv: vi.fn(),
  parseExcel: vi.fn(),
}))

describe('useFileParser', () => {
  it('should initialize with default state', () => {
    const { isParsing, parseErrors, rawHeaders, rawRows } = useFileParser()
    expect(isParsing.value).toBe(false)
    expect(parseErrors.value).toEqual([])
    expect(rawHeaders.value).toEqual([])
    expect(rawRows.value).toEqual([])
  })

  it('should parse CSV files correctly', async () => {
    const mockResult = {
      data: [{ col1: 'val1' }],
      headers: ['col1'],
      errors: []
    }
    vi.mocked(parsers.parseCsv).mockResolvedValueOnce(mockResult as any)

    const { parseFile, isParsing, rawHeaders, rawRows } = useFileParser()
    const file = new File([''], 'test.csv', { type: 'text/csv' })
    
    const result = parseFile(file)
    expect(isParsing.value).toBe(true)
    
    await result
    
    expect(isParsing.value).toBe(false)
    expect(rawHeaders.value).toEqual(['col1'])
    expect(rawRows.value).toEqual([{ col1: 'val1' }])
  })

  it('should handle unsupported file extensions', async () => {
    const { parseFile, parseErrors } = useFileParser()
    const file = new File([''], 'test.txt', { type: 'text/plain' })
    
    await parseFile(file)
    
    expect(parseErrors.value).toContain('ingestion.errors.unsupported_format')
  })
})
