import { describe, it, expect } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { preciseAmountSchema } from '@kryptofolio/shared-types'
import { normalizeTransactionDirection } from '@kryptofolio/core-domain'
import { parseExcel } from '../parsers'

/**
 * The reader, the normalizer and the anti-corruption layer live in three packages. This drives the
 * whole chain on the row shape `bit2me_spot_2025.xlsx` actually contains, asserting that the stored
 * float64 — not a display-formatted truncation of it — is what reaches the schema boundary, and that
 * a 17-significant-digit decimal is still schema-valid there.
 */
async function bit2meWorkbookFile(): Promise<File> {
  const rows = [
    [
      'Tipo',
      'Cantidad de origen',
      'Moneda de origen',
      'Cantidad de destino',
      'Moneda de destino',
      'Comisión de la operación',
      'Moneda de la comisión',
      'Fecha',
    ],
    ['Withdrawal', 99.3, 'HBAR', 100, 'HBAR', 0.15742981799999997, 'HBAR', '2025-02-03 06:41'],
  ]
  const buffer = await writeXlsxFile(rows).toBuffer()
  return new File([new Uint8Array(buffer)], 'bit2me_spot_2025.xlsx')
}

describe('a spreadsheet cell keeps the source digits all the way to the ledger contract', () => {
  it('carries the stored digits through the normalizer into a schema-valid amount', async () => {
    const parsed = await parseExcel(await bit2meWorkbookFile())
    const row = parsed.data[0]

    const normalized = normalizeTransactionDirection({
      date: String(row['Fecha']),
      tx_type: String(row['Tipo']),
      amount: String(row['Cantidad de origen']),
      asset: String(row['Moneda de origen']),
      fee_amount: String(row['Comisión de la operación']),
      fee_currency: String(row['Moneda de la comisión']),
      metadata: { subclass: 'crypto' },
    }, 'UTC')

    expect(normalized.tx_type).toBe('TRANSFER_OUT')
    expect(normalized.fee_amount).toBe('0.15742981799999997')
    expect(normalized.fee_currency).toBe('HBAR')

    expect(preciseAmountSchema.safeParse(normalized.fee_amount).success).toBe(true)
    expect(preciseAmountSchema.safeParse(normalized.amount_out).success).toBe(true)
  })
})
