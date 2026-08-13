import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file/browser'

export interface ParseResult {
  data: Record<string, unknown>[]
  headers: string[]
  errors: string[]
}

/**
 * Rewrites JavaScript's exponential rendering as a plain decimal. `String(0.00000001)` is `"1e-8"`,
 * which every downstream amount schema rejects, and satoshi- and gwei-scale quantities are ordinary.
 *
 * This is the only transform a numeric cell receives. A workbook writer serialises a cell as the
 * shortest decimal string that round-trips to the stored double, and `String(number)` produces that
 * same shortest round-tripping string — so reading the stored value back as a plain decimal is
 * already an exact reproduction of the source's own digits, verified against the real Bit2Me
 * workbooks. Excel's *displayed* text is a different thing: its General format has an ~11-character
 * budget and abbreviates beyond it (`149.99999997` shows as `150`), which is a statement about column
 * width, not about the recorded figure — do not reintroduce a preference for it.
 */
export function toPlainDecimalString(value: number): string {
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
 * `read-excel-file` represents an empty cell as `null`, where `xlsx`'s `defval: ''` produced `''`.
 * `processRawRows` treats any non-`undefined` value as present, so an unnormalised `null` would become
 * the literal four-character string `"null"` in a data column. Numbers are rendered through
 * `toPlainDecimalString` for the same reason `xlsx`'s output was: `String()` on a stored float64 is
 * already its shortest round-tripping decimal, not a display-formatted approximation of it.
 */
function normalizeCell(cell: unknown): unknown {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'number' && Number.isFinite(cell)) return toPlainDecimalString(cell)
  return cell
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
      const data = e.target?.result as ArrayBuffer

      // `trim: false` — the library's default trims string cells and folds whatever trims to '' into
      // `null`, silently discarding a whitespace-only cell's stored content (measured: the real corpus
      // has one, `"str"`-typed with a literal single-space `<v>`). `xlsx` never trimmed; matching that
      // is what "reads the stored value, not a display-formatted version of it" requires here too.
      readXlsxFile(data, { trim: false })
        .then((sheets) => {
          if (sheets.length === 0) {
            return resolve({ data: [], headers: [], errors: ['ingestion.errors.no_sheets'] })
          }

          const rawRows = sheets[0].data.map(row => row.map(normalizeCell))

          if (rawRows.length === 0) {
            return resolve({ data: [], headers: [], errors: ['ingestion.errors.file_empty'] })
          }

          resolve(processRawRows(rawRows))
        })
        .catch((error) => {
          resolve({
            data: [],
            headers: [],
            errors: [error instanceof Error ? error.message : 'ingestion.errors.unknown_parsing_error'],
          })
        })
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
