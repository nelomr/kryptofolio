import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcel } from '../parsers'

/** Matches what `preciseAmountSchema` accepts: a plain decimal, never exponential notation. */
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * The cells are the ones the real Bit2Me workbooks store. `bit2me_spot_2025.xlsx` literally holds
 * `<v>0.15742981799999997</v>` for a figure Excel displays as `0.157429818`, so the artefact is in the
 * file and the reader's only job is to not make it worse than what the source shows.
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
  it("keeps the digits the source displays rather than the float64 expansion behind them", async () => {
    const file = workbookFile([
      ['Tipo', 'Cantidad de origen', 'Comisión de la operación'],
      ['Withdrawal', 99.3, 0.15742981799999997],
      ['Withdrawal', 2.9997, 0.0007158659969999999],
      ['Withdrawal', 610, 1.1340999999999999],
    ])

    const result = await parseExcel(file)

    expect(result.errors).toEqual([])
    expect(result.data.map(row => row['Comisión de la operación'])).toEqual([
      '0.157429818',
      '0.000715866',
      '1.1341',
    ])
    expect(result.data.map(row => row['Cantidad de origen'])).toEqual(['99.3', '2.9997', '610'])
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
