import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParseResult {
  data: Record<string, unknown>[]
  headers: string[]
  errors: string[]
}

/** What the anti-corruption layer's `preciseAmountSchema` accepts. */
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * Rewrites JavaScript's exponential rendering as a plain decimal. `String(0.00000001)` is `"1e-8"`,
 * which every downstream amount schema rejects, and satoshi- and gwei-scale quantities are ordinary.
 */
function toPlainDecimalString(value: number): string {
  const text = String(value)
  const parts = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text)
  if (!parts) return text

  const [, sign, integerDigits, fractionDigits = '', exponentText] = parts
  const digits = integerDigits + fractionDigits
  const pointIndex = integerDigits.length + Number(exponentText)

  if (pointIndex <= 0) return `${sign}0.${'0'.repeat(-pointIndex)}${digits}`
  if (pointIndex >= digits.length) return `${sign}${digits}${'0'.repeat(pointIndex - digits.length)}`
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`
}

/**
 * Chooses between the number a spreadsheet stores and the text it displays.
 *
 * A workbook stores float64, so a figure written as `0.157429818` is held as `0.15742981799999997` and
 * the displayed text is the only place the source's own digits still exist. The displayed text is
 * preferred only when it is already a plain decimal: cell formatting can also abbreviate (`1.23457E+14`
 * for a fifteen-digit integer) or decorate (a thousands separator, a currency symbol, a date), and in
 * all of those the stored number is the more faithful reading.
 */
function preferDisplayedDigits(storedValue: unknown, displayedText: unknown): unknown {
  if (typeof storedValue !== 'number' || !Number.isFinite(storedValue)) return storedValue
  if (typeof displayedText === 'string' && PLAIN_DECIMAL.test(displayedText)) return displayedText
  return toPlainDecimalString(storedValue)
}

/**
 * Processes a raw 2D array of strings/mixed values into an array of objects based on a detected header row.
 * Scans the first 20 rows to find the row with the most columns, assuming that is the header.
 */
export function processRawRows(rawRows: unknown[][]): ParseResult {
  if (!rawRows || rawRows.length === 0) {
    return { data: [], headers: [], errors: ['ingestion.errors.no_valid_data'] }
  }

  // 1. Find the header row (scanning first 20 rows for the one with max non-empty columns)
  const headerCandidates = rawRows.slice(0, 20).map((row, index) => {
    if (!Array.isArray(row)) return { index, count: 0 }
    const count = row.filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '').length
    return { index, count }
  })

  const { index: headerIndex, count: maxCols } = headerCandidates.reduce(
    (max, curr) => (curr.count > max.count ? curr : max),
    { index: 0, count: 0 }
  )

  if (maxCols === 0 || rawRows.length <= headerIndex) {
    return { data: [], headers: [], errors: ['ingestion.errors.no_valid_data'] }
  }

  const headers = rawRows[headerIndex].map(h => h ? String(h).trim() : '')
  const validHeaders = headers.filter(h => h !== '')

  // 2. Process data rows declaratively
  const data = rawRows
    .slice(headerIndex + 1)
    .filter(rowArr => {
      // Filter out invalid or completely empty rows
      if (!Array.isArray(rowArr)) return false
      return rowArr.some(cell => cell && String(cell).trim() !== '')
    })
    .map(rowArr => {
      // Map array values to object properties using headers
      return headers.reduce((acc, header, idx) => {
        if (header) {
          acc[header] = rowArr[idx] !== undefined ? String(rowArr[idx]).trim() : ''
        }
        return acc
      }, {} as Record<string, unknown>)
    })

  return {
    data,
    headers: validHeaders,
    errors: [],
  }
}

/**
 * Parses a CSV file into an array of objects.
 */
export function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      delimitersToGuess: [',', '\t', '|', ';'],
      complete: (results) => {
        const rawRows = results.data as string[][]
        
        if (!rawRows || rawRows.length === 0) {
          return resolve({ data: [], headers: [], errors: ['ingestion.errors.file_empty'] })
        }

        const processed = processRawRows(rawRows)
        // Merge PapaParse errors with processed errors
        processed.errors = [...processed.errors, ...results.errors.map(e => e.message)]
        resolve(processed)
      },
      error: (error) => {
        resolve({
          data: [],
          headers: [],
          errors: [error.message],
        })
      }
    })
  })
}

/**
 * Parses an Excel file into an array of objects.
 */
export function parseExcel(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        
        if (workbook.SheetNames.length === 0) {
          return resolve({ data: [], headers: [], errors: ['ingestion.errors.no_sheets'] })
        }

        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Use header: 1 to extract an array of arrays
        const storedRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })
        const displayedRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: '',
          raw: false,
        })

        const rawRows = storedRows.map((row, rowIndex) =>
          Array.isArray(row)
            ? row.map((cell, cellIndex) =>
                preferDisplayedDigits(cell, displayedRows[rowIndex]?.[cellIndex]),
              )
            : row,
        )

        if (!rawRows || rawRows.length === 0) {
          return resolve({ data: [], headers: [], errors: ['ingestion.errors.file_empty'] })
        }

        const processed = processRawRows(rawRows)
        resolve(processed)
      } catch (error) {
        resolve({
          data: [],
          headers: [],
          errors: [error instanceof Error ? error.message : 'ingestion.errors.unknown_parsing_error'],
        })
      }
    }

    reader.onerror = () => {
      resolve({
        data: [],
        headers: [],
        errors: ['ingestion.errors.read_failed'],
      })
    }

    reader.readAsArrayBuffer(file)
  })
}
