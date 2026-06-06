/**
 * BitvavoCsvParser — Parses Bitvavo exchange CSV exports.
 *
 * Columns: Timezone | Date | Time | Type | Currency | Amount |
 *          Quote Currency | Quote Price | Received / Paid Currency |
 *          Received / Paid Amount | Fee currency | Fee amount |
 *          Status | Transaction ID | Address
 *
 * Each row is one operation. Direction determined by Amount sign and Type.
 *
 * @implements ICsvIngestionPort
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import type { TaxTransactionEntity, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

type RawRow = Record<string, string>

const REQUIRED_HEADERS = ['Quote Currency', 'Transaction ID']

const REWARD_TYPES = new Set([
  'campaign_new_user_incentive',
  'referral',
  'staking',
  'airdrop',
  'cashback',
])

import { errorBus } from '@/core/infrastructure/errors/errorBus'

export class BitvavoCsvParser implements ICsvIngestionPort {
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
      errorBus.emit('validation-error', {
        message: 'errors.validation.parser_skipped_rows',
        params: { parser: 'Bitvavo', skipped }
      })
    }

    return results
  }

  private _parseRow(row: RawRow): TaxTransactionEntity | null {
    const rawType = (row.Type ?? '').toLowerCase()
    const symbol = row.Currency ?? 'UNKNOWN'
    const amount = Math.abs(parseFloat(row.Amount ?? '0'))
    const paidAmount = parseFloat(row['Received / Paid Amount'] ?? '0')
    const feeCurrency = row['Fee currency'] ?? ''
    const feeAmount = parseFloat(row['Fee amount'] ?? '0')
    const feeEur = feeCurrency === 'EUR' ? feeAmount : 0
    const txId = row['Transaction ID'] ?? `bitvavo-${Math.random()}`

    let txType: TaxTransactionType
    let totalEur = 0

    if (rawType === 'buy') {
      txType = 'BUY'
      // paidAmount is negative (EUR spent), take absolute
      totalEur = Math.abs(paidAmount)
    } else if (rawType === 'sell') {
      txType = 'SELL'
      totalEur = Math.abs(paidAmount)
    } else if (rawType === 'withdrawal') {
      txType = 'WITHDRAWAL'
    } else if (rawType === 'deposit') {
      txType = 'DEPOSIT'
    } else if (REWARD_TYPES.has(rawType)) {
      txType = 'REWARD'
    } else {
      return null
    }

    const dateStr = `${row.Date ?? ''}T${(row.Time ?? '').split('.')[0]}Z`
    const timestamp = new Date(dateStr)

    return {
      id: TransactionIdSchema.parse(`bitvavo-${txId}`),
      type: txType,
      symbol,
      amount,
      totalEur,
      priceEur: amount > 0 && totalEur > 0 ? totalEur / amount : 0,
      feeEur,
      timestamp: isNaN(timestamp.getTime()) ? new Date(0) : timestamp,
      exchange: 'Bitvavo',
      refId: txId,
    }
  }
}
