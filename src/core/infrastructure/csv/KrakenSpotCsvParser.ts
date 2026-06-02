/**
 * KrakenSpotCsvParser — Parses Kraken Spot export CSV.
 *
 * Kraken exports TWO rows per trade (EUR leg + crypto leg) linked by `refid`.
 * Single-row types (deposit, withdrawal, transfer) are processed directly.
 *
 * Column order: txid, refid, time, type, subtype, aclass, subclass,
 *               asset, wallet, amount, fee, balance
 *
 * @implements ICsvIngestionPort
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import type { TaxTransactionEntity, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'

type RawRow = Record<string, string>

const REQUIRED_HEADERS = ['txid', 'refid', 'subclass']

import { errorBus } from '@/core/infrastructure/errors/errorBus'

export class KrakenSpotCsvParser implements ICsvIngestionPort {
  detect(headers: string[]): boolean {
    return REQUIRED_HEADERS.every((h) => headers.includes(h))
  }

  parse(rawRows: RawRow[]): TaxTransactionEntity[] {
    const results: TaxTransactionEntity[] = []

    // Group all rows by refid — trades come as pairs, others are singles
    const grouped = new Map<string, RawRow[]>()
    let skipped = 0

    for (const row of rawRows) {
      if (!row.refid) continue
      if (!grouped.has(row.refid)) grouped.set(row.refid, [])
      grouped.get(row.refid)!.push(row)
    }

    for (const [refid, rows] of grouped) {
      try {
        const type = rows[0]?.type?.toLowerCase() ?? ''

        if (type === 'trade') {
          const entity = this._parseTradePair(refid, rows)
          if (entity) results.push(entity)
          else skipped++
        } else {
          // Single-row types
          const entity = this._parseSingleRow(rows[0])
          if (entity) results.push(entity)
          else skipped++
        }
      } catch {
        skipped++
      }
    }

    if (skipped > 0) {
      errorBus.emit('validation-error', { message: `Kraken parser skipped ${skipped} invalid or unsupported operations.` })
    }

    return results
  }

  private _parseTradePair(refid: string, rows: RawRow[]): TaxTransactionEntity | null {
    const eurLeg = rows.find((r) => r.subclass === 'fiat' && r.asset === 'EUR')
    const cryptoLeg = rows.find((r) => r.subclass === 'crypto')

    if (!eurLeg || !cryptoLeg) return null

    const eurAmount = parseFloat(eurLeg.amount ?? '0')
    const cryptoAmount = parseFloat(cryptoLeg.amount ?? '0')
    const euroFee = parseFloat(eurLeg.fee ?? '0')

    // BUY: EUR is negative (spending), crypto is positive (receiving)
    // SELL: EUR is positive (receiving), crypto is negative (spending)
    const isBuy = eurAmount < 0

    const symbol = cryptoLeg.asset
    const amount = Math.abs(cryptoAmount)
    const totalEur = Math.abs(eurAmount)
    // Fee is only EUR-denominated if in the EUR leg
    const feeEur = euroFee > 0 ? euroFee : 0

    return {
      id: TransactionIdSchema.parse(`kraken-${refid}`),
      type: isBuy ? 'BUY' : 'SELL',
      symbol,
      amount,
      totalEur,
      priceEur: amount > 0 ? totalEur / amount : 0,
      feeEur,
      timestamp: this._parseDate(eurLeg.time ?? cryptoLeg.time ?? ''),
      exchange: 'Kraken',
      refId: refid,
    }
  }

  private _parseSingleRow(row: RawRow): TaxTransactionEntity | null {
    if (!row) return null
    const type = row.type?.toLowerCase() ?? ''
    const subtype = row.subtype?.toLowerCase() ?? ''
    const amount = Math.abs(parseFloat(row.amount ?? '0'))

    let txType: TaxTransactionType
    if (type === 'deposit') {
      txType = 'DEPOSIT'
    } else if (type === 'withdrawal') {
      txType = 'WITHDRAWAL'
    } else if (type === 'transfer') {
      txType = parseFloat(row.amount ?? '0') < 0 ? 'TRANSFER_OUT' : 'TRANSFER_IN'
    } else {
      return null
    }

    // Suppress unused variable warning
    void subtype

    return {
      id: TransactionIdSchema.parse(`kraken-${row.txid ?? row.refid ?? Math.random()}`),
      type: txType,
      symbol: row.asset ?? 'UNKNOWN',
      amount,
      totalEur: 0,
      priceEur: 0,
      feeEur: 0,
      timestamp: this._parseDate(row.time ?? ''),
      exchange: 'Kraken',
      refId: row.refid,
    }
  }

  private _parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0)
    const d = new Date(dateStr.replace(' ', 'T') + 'Z')
    return isNaN(d.getTime()) ? new Date(0) : d
  }
}
