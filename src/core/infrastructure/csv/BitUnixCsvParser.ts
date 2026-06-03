/**
 * BitUnixCsvParser — Parses BitUnix CSV exports.
 *
 * Columns: Date (UTC) | Label | Outgoing Asset | Outgoing Amount |
 *          Incoming Asset | Incoming Amount | Fee Asset | Fee Amount |
 *          Trx. ID | Comment
 *
 * Direction is determined by which of Outgoing/Incoming has a non-zero asset.
 * File uses CRLF line endings (handled by papaparse automatically).
 *
 * @implements ICsvIngestionPort
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import type { TaxTransactionEntity, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

type RawRow = Record<string, string>

const REQUIRED_HEADERS = ['Outgoing Asset', 'Incoming Asset', 'Label']

import { errorBus } from '@/core/infrastructure/errors/errorBus'

export class BitUnixCsvParser implements ICsvIngestionPort {
  detect(headers: string[]): boolean {
    return REQUIRED_HEADERS.every((h) => headers.includes(h))
  }

  parse(rawRows: RawRow[]): TaxTransactionEntity[] {
    const results: TaxTransactionEntity[] = []
    let skipped = 0

    for (const row of rawRows) {
      try {
        const entity = this._parseRow(row)
        if (entity) results.push(entity)
        else skipped++
      } catch {
        skipped++
      }
    }

    if (skipped > 0) {
      errorBus.emit('validation-error', { message: `BitUnix parser skipped ${skipped} invalid or unsupported rows.` })
    }

    return results
  }

  private _parseRow(row: RawRow): TaxTransactionEntity | null {
    const outAsset = (row['Outgoing Asset'] ?? '').trim()
    const inAsset = (row['Incoming Asset'] ?? '').trim()
    const outAmount = parseFloat(row['Outgoing Amount'] ?? '0')
    const inAmount = parseFloat(row['Incoming Amount'] ?? '0')
    const feeAsset = (row['Fee Asset'] ?? '').trim()
    const feeAmount = parseFloat(row['Fee Amount'] ?? '0')
    const feeEur = feeAsset === 'EUR' ? feeAmount : 0
    const txId = row['Trx. ID'] ?? `bitunix-${Math.random()}`
    const label = (row.Label ?? '').toLowerCase()

    let txType: TaxTransactionType
    let symbol: string
    let amount: number

    const hasOutgoing = outAsset !== '' && outAmount > 0
    const hasIncoming = inAsset !== '' && inAmount > 0

    if (hasOutgoing && hasIncoming) {
      // Trade / Swap — treat as BUY for now (BitUnix doesn't separate EUR legs)
      txType = 'SWAP'
      symbol = inAsset
      amount = inAmount
    } else if (hasIncoming && !hasOutgoing) {
      txType = label.includes('deposit') || label.includes('chain deposit') ? 'DEPOSIT' : 'DEPOSIT'
      symbol = inAsset
      amount = inAmount
    } else if (hasOutgoing && !hasIncoming) {
      txType = label.includes('withdraw') ? 'WITHDRAWAL' : 'WITHDRAWAL'
      symbol = outAsset
      amount = outAmount
    } else {
      return null
    }

    const timestamp = this._parseDate(row['Date (UTC)'] ?? '')

    return {
      id: TransactionIdSchema.parse(`bitunix-${txId}`),
      type: txType,
      symbol,
      amount,
      totalEur: 0, // BitUnix doesn't provide EUR values in the export
      priceEur: 0,
      feeEur,
      timestamp,
      exchange: 'BitUnix',
      refId: txId,
    }
  }

  private _parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0)
    // Format: "2025-12-13 12:18:14" (UTC)
    const d = new Date(dateStr.replace(' ', 'T') + 'Z')
    return isNaN(d.getTime()) ? new Date(0) : d
  }
}
