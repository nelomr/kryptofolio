/**
 * Bit2MeXlsxParser — Parses Bit2Me XLSX exports (via SheetJS).
 *
 * SheetJS converts the XLSX to plain JSON rows before this parser is called,
 * so this parser only sees `Record<string, string>[]` — same interface as CSV.
 *
 * Columns (dynamic header detection — scans for 'Tipo de operación'):
 *   Tipo de operación | Cantidad de destino | Moneda de destino |
 *   Cantidad de origen | Moneda de origen | Comisión de la operación |
 *   Moneda de la comisión | Exchange | Grupo | Descripción | Fecha
 *
 * Type mapping (replicates backend/src/domain/fiscal/parsers/bit2me.py logic):
 *   trade (EUR → Crypto) → BUY
 *   trade (Crypto → EUR) → SELL
 *   swap  (Crypto → Crypto) → SELL (origin) + BUY (destination)
 *   deposit → DEPOSIT
 *   withdrawal → WITHDRAW
 *   staking / cashback / referral / airdrop → REWARD
 *
 * @implements ICsvIngestionPort
 * @see backend/src/domain/fiscal/parsers/bit2me.py (reference implementation)
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import type { TaxTransactionEntity, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'

type RawRow = Record<string, string>

const DETECT_HEADER = 'Tipo de operación'

const TYPE_MAP: Record<string, TaxTransactionType | 'TRADE' | 'REWARD'> = {
  trade: 'TRADE',
  swap: 'TRADE',  // Crypto→Crypto swap, handled by direction logic
  deposit: 'DEPOSIT',
  withdrawal: 'WITHDRAWAL',
  staking: 'REWARD',
  cashback: 'REWARD',
  referral: 'REWARD',
  airdrop: 'REWARD',
}

import { errorBus } from '@/core/infrastructure/errors/errorBus'

export class Bit2MeXlsxParser implements ICsvIngestionPort {
  detect(headers: string[]): boolean {
    return headers.includes(DETECT_HEADER)
  }

  parse(rawRows: RawRow[]): TaxTransactionEntity[] {
    const results: TaxTransactionEntity[] = []
    let skipped = 0

    for (let i = 0; i < rawRows.length; i++) {
      try {
        const entities = this._parseRow(rawRows[i], i)
        if (entities.length > 0) results.push(...entities)
        else skipped++
      } catch {
        skipped++
      }
    }

    if (skipped > 0) {
      errorBus.emit('validation-error', { message: `Bit2Me parser skipped ${skipped} invalid or unsupported rows.` })
    }

    return results
  }

  private _parseRow(row: RawRow, rowIndex: number): TaxTransactionEntity[] {
    const tipo = (row['Tipo de operación'] ?? '').trim().toLowerCase()
    if (!tipo) return []

    const mappedType = TYPE_MAP[tipo]
    if (!mappedType) return []

    const destAmount = parseFloat(row['Cantidad de destino'] ?? '0') || 0
    const destCurrency = (row['Moneda de destino'] ?? '').trim().toUpperCase()
    const srcAmount = parseFloat(row['Cantidad de origen'] ?? '0') || 0
    const srcCurrency = (row['Moneda de origen'] ?? '').trim().toUpperCase()
    const feeAmount = parseFloat(row['Comisión de la operación'] ?? '0') || 0
    const feeCurrency = (row['Moneda de la comisión'] ?? '').trim().toUpperCase()
    const description = (row['Descripción'] ?? '').trim()
    const dateStr = (row['Fecha'] ?? '').trim()

    const feeEur = feeCurrency === 'EUR' ? feeAmount : 0
    const timestamp = this._parseDate(dateStr)

    const idBase = `bit2me-${tipo}-${rowIndex}`

    if (mappedType === 'DEPOSIT') {
      return [this._make(idBase, 'DEPOSIT', destCurrency, destAmount, 0, feeEur, timestamp, description)]
    }

    if (mappedType === 'WITHDRAWAL') {
      const asset = srcCurrency || destCurrency
      const amount = srcAmount > 0 ? srcAmount : destAmount
      return [this._make(idBase, 'WITHDRAWAL', asset, amount, 0, feeEur, timestamp, description)]
    }

    if (mappedType === 'REWARD') {
      return [this._make(idBase, 'REWARD', destCurrency, destAmount, 0, feeEur, timestamp, description)]
    }

    if (mappedType === 'TRADE') {
      const isSrcEur = srcCurrency === 'EUR'
      const isDestEur = destCurrency === 'EUR'

      if (isSrcEur && !isDestEur) {
        // EUR → Crypto = BUY
        const totalEur = srcAmount
        const priceEur = destAmount > 0 ? totalEur / destAmount : 0
        return [this._make(idBase, 'BUY', destCurrency, destAmount, totalEur, feeEur, timestamp, description, priceEur)]
      }

      if (!isSrcEur && isDestEur) {
        // Crypto → EUR = SELL
        const totalEur = destAmount
        const priceEur = srcAmount > 0 ? totalEur / srcAmount : 0
        return [this._make(idBase, 'SELL', srcCurrency, srcAmount, totalEur, feeEur, timestamp, description, priceEur)]
      }

      if (!isSrcEur && !isDestEur) {
        // Crypto → Crypto = SWAP: emit SELL + BUY
        const swapDesc = description || `SWAP: ${srcAmount} ${srcCurrency} → ${destAmount} ${destCurrency}`
        const sell = this._make(`${idBase}-SELL`, 'SELL', srcCurrency, srcAmount, 0, feeEur, timestamp, swapDesc)
        const buy = this._make(`${idBase}-BUY`, 'BUY', destCurrency, destAmount, 0, 0, timestamp, swapDesc)
        return [sell, buy]
      }
    }

    return []
  }

  private _make(
    idRaw: string,
    type: TaxTransactionType,
    symbol: string,
    amount: number,
    totalEur: number,
    feeEur: number,
    timestamp: Date,
    description: string,
    priceEur: number = 0,
  ): TaxTransactionEntity {
    return {
      id: TransactionIdSchema.parse(idRaw),
      type,
      symbol,
      amount,
      totalEur,
      priceEur,
      feeEur,
      timestamp,
      exchange: 'Bit2Me',
      refId: description || undefined,
    }
  }

  private _parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(0)
    // Format: "2024-03-15 10:00:00" (Europe/Madrid local time — treat as UTC for UI)
    const d = new Date(dateStr.replace(' ', 'T'))
    return isNaN(d.getTime()) ? new Date(0) : d
  }
}
