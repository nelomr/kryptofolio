/**
 * TangemCsvParser — Parses Tangem wallet CSV exports.
 *
 * Columns: Date | Type | Asset | Amount | Fee | Notes
 *
 * Simple one-row-per-operation format. WALLET_ACTIVATION is mapped to
 * DEPOSIT with a special refId flag for audit traceability (AEAT).
 *
 * @implements ICsvIngestionPort
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import type { TaxTransactionEntity, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'

type RawRow = Record<string, string>

// Columns that must be present and are NOT shared with other parsers
const REQUIRED_HEADERS = ['Notes', 'Asset', 'Amount', 'Fee', 'Type', 'Date']
// Headers that would indicate it's actually another exchange's format
const EXCLUDE_IF_PRESENT = ['txid', 'refid', 'subclass', 'Quote Currency', 'Transaction ID', 'Outgoing Asset', 'Tipo de operación']

const TYPE_MAP: Record<string, TaxTransactionType> = {
  WALLET_ACTIVATION: 'DEPOSIT',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  RECEIVE: 'DEPOSIT',
  SEND: 'WITHDRAWAL',
}

import { errorBus } from '@/core/infrastructure/errors/errorBus'

export class TangemCsvParser implements ICsvIngestionPort {
  detect(headers: string[]): boolean {
    const hasRequired = REQUIRED_HEADERS.every((h) => headers.includes(h))
    const hasExcluded = EXCLUDE_IF_PRESENT.some((h) => headers.includes(h))
    return hasRequired && !hasExcluded
  }

  parse(rawRows: RawRow[]): TaxTransactionEntity[] {
    const results: TaxTransactionEntity[] = []
    let skipped = 0

    for (let i = 0; i < rawRows.length; i++) {
      try {
        const entity = this._parseRow(rawRows[i], i)
        if (entity) results.push(entity)
        else skipped++
      } catch {
        skipped++
      }
    }

    if (skipped > 0) {
      errorBus.emit('validation-error', { message: `Tangem parser skipped ${skipped} invalid or unsupported rows.` })
    }

    return results
  }

  private _parseRow(row: RawRow, rowIndex: number): TaxTransactionEntity | null {
    const rawType = (row.Type ?? '').trim().toUpperCase()
    const txType = TYPE_MAP[rawType]
    if (!txType) return null

    const symbol = (row.Asset ?? '').trim().toUpperCase()
    if (!symbol) return null

    const amount = Math.abs(parseFloat(row.Amount ?? '0'))
    const fee = parseFloat(row.Fee ?? '0')
    const notes = row.Notes ?? ''
    const isWalletActivation = rawType === 'WALLET_ACTIVATION'

    // Build a deterministic refId for WALLET_ACTIVATION (AEAT audit trail)
    const refId = isWalletActivation
      ? `WALLET_ACTIVATION-${symbol}-${rowIndex}`
      : `tangem-${symbol}-${rowIndex}`

    return {
      id: TransactionIdSchema.parse(`tangem-${refId}`),
      type: txType,
      symbol,
      amount,
      totalEur: 0,
      priceEur: 0,
      feeEur: 0, // Tangem fees are in-asset, never EUR-denominated
      timestamp: this._parseDate(row.Date ?? ''),
      exchange: 'Tangem',
      refId,
    }
  }

  private _parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0)
    // Format: "2025-06-03 10:01:00 UTC" or ISO
    const cleaned = dateStr.replace(' UTC', 'Z').replace(' ', 'T')
    const d = new Date(cleaned)
    return isNaN(d.getTime()) ? new Date(0) : d
  }
}
