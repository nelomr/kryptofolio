import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcel } from '../parsers'

/** Matches what `preciseAmountSchema` accepts: a plain decimal, never exponential notation. */
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * The values below are transcribed from the literal `<v>` strings in the real Bit2Me workbooks'
 * `xl/worksheets/sheet1.xml`, confirmed independently of SheetJS (Python `xml.etree`), not derived
 * from writing and re-reading a workbook with the library under test. `preferDisplayedDigits` used
 * to substitute Excel's General-format display text — an ~11-character budget — for these figures,
 * which discards real recorded digits it mistook for float64 noise. The parser's only remaining job
 * is to render the stored value as a plain decimal, unrounded.
 */
function workbookFile(rows: unknown[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  const buffer: ArrayBuffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' })
  return new File([buffer], 'source.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parseExcel numeric fidelity', () => {
  it('keeps every digit the source stored, not the digits a display format would show', async () => {
    // bit2me_spot_2025.xlsx!F72, F123, F339 — EUR fee valuations with 16-17 significant digits.
    const file = workbookFile([
      ['Tipo', 'Cantidad de origen', 'Comisión de la operación'],
      ['Withdrawal', 99.3, 0.15742981799999997],
      ['Withdrawal', 2.9997, 0.0007158659969999999],
      ['Withdrawal', 610, 1.1340999999999999],
    ])

    const result = await parseExcel(file)

    expect(result.errors).toEqual([])
    expect(result.data.map(row => row['Comisión de la operación'])).toEqual([
      '0.15742981799999997',
      '0.0007158659969999999',
      '1.1340999999999999',
    ])
    expect(result.data.map(row => row['Cantidad de origen'])).toEqual(['99.3', '2.9997', '610'])
  })

  it('does not shorten a quantity a General display format would abbreviate to fewer digits', async () => {
    // bit2me_spot_2024.xlsx!B6 — a destination amount, 13 significant digits, real recorded data.
    const file = workbookFile([
      ['Tipo', 'Cantidad de destino'],
      ['Trade', 1244.13519942],
    ])

    const result = await parseExcel(file)

    expect(result.data[0]['Cantidad de destino']).toBe('1244.13519942')
  })

  it('does not resolve a near-integer to the round number a display format would show', async () => {
    // bit2me_spot_2025.xlsx!D71 — an origin amount of a Trade; 1.06e6 ULP away from 150, not noise.
    const file = workbookFile([
      ['Tipo', 'Cantidad de origen'],
      ['Trade', 149.99999997],
    ])

    const result = await parseExcel(file)

    expect(result.data[0]['Cantidad de origen']).toBe('149.99999997')
  })

  it('renders sub-microscopic quantities as plain decimals the amount schema can accept', async () => {
    const file = workbookFile([
      ['Tipo', 'Cantidad'],
      ['Withdrawal', 0.00000001],
      ['Withdrawal', 1e-12],
      ['Withdrawal', 0.000000015],
    ])

    const result = await parseExcel(file)

    const amounts = result.data.map(row => String(row['Cantidad']))
    expect(amounts).toEqual(['0.00000001', '0.000000000001', '0.000000015'])
    for (const amount of amounts) {
      expect(amount).toMatch(PLAIN_DECIMAL)
    }
  })

  it('keeps every digit of a large integer that General formatting would abbreviate', async () => {
    const file = workbookFile([
      ['Tipo', 'Cantidad'],
      ['Deposit', 123456789012345],
    ])

    const result = await parseExcel(file)

    expect(result.data[0]['Cantidad']).toBe('123456789012345')
  })

  it('leaves a non-numeric cell exactly as the source wrote it', async () => {
    const file = workbookFile([
      ['Tipo', 'Moneda', 'Fecha'],
      ['Withdrawal', 'HBAR', '2025-02-03 06:41'],
    ])

    const result = await parseExcel(file)

    expect(result.data[0]).toEqual({
      Tipo: 'Withdrawal',
      Moneda: 'HBAR',
      Fecha: '2025-02-03 06:41',
    })
  })
})
