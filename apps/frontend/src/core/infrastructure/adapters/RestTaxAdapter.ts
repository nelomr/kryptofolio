/**
 * RestTaxAdapter — Production HTTP adapter for fiscal/tax data.
 *
 * Implements ITaxRepository using Hono RPC (hc).
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { TaxTransactionEntity, TaxReportEntity, TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'
import {
  ExternalTaxTransactionSchema,
  ExternalTaxReportSchema,
} from '@/core/infrastructure/dtos/ExternalTaxSchemas'
import { CexFuturesLedgerSchema } from '@/core/infrastructure/dtos/ExternalFuturesSchemas'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'
import { DomainValidationError } from './RestCryptoAdapter'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'
import { bffClient } from '../http/BffClient'

function parseOrFail<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } },
  rawData: unknown,
  context: string,
): T {
  const result = schema.safeParse(rawData)
  if (!result.success) {
    errorBus.emit('validation-error', { 
      message: 'errors.validation.api_malformed_data',
      context: context, 
      details: result.error 
    })
    throw new DomainValidationError(context, result.error)
  }
  return result.data!
}

export class RestTaxAdapter implements ITaxRepository {
  async getSpotTransactions(): Promise<TaxTransactionEntity[]> {
    const res = await bffClient.api.tax.transactions.spot.$get()
    const rawArray = await res.json()

    const parsed: TaxTransactionEntity[] = []
    for (const rawTx of (Array.isArray(rawArray) ? rawArray : [])) {
      const result = ExternalTaxTransactionSchema.safeParse(rawTx)
      if (result.success) {
        const dto = result.data
        parsed.push({
          id: TransactionIdSchema.parse(dto.id),
          type: dto.type,
          symbol: dto.symbol,
          amount: dto.amount,
          totalEur: dto.totalEur,
          priceEur: dto.priceEur,
          feeEur: dto.feeEur,
          timestamp: dto.timestamp,
          assetIn: dto.assetIn,
          assetOut: dto.assetOut,
          amountIn: dto.amountIn,
          amountOut: dto.amountOut,
          exchange: dto.exchange,
          refId: dto.refId,
        })
      } else {
        console.warn('[RestTaxAdapter] Skipping invalid transaction:', result.error, rawTx)
      }
    }
    return parsed
  }

  async getFuturesTransactions(): Promise<TaxTransactionEntity[]> {
    const res = await bffClient.api.tax.transactions.futures.$get()
    const rawArray = await res.json()

    const parsed: TaxTransactionEntity[] = []
    for (const rawTx of (Array.isArray(rawArray) ? rawArray : [])) {
      const result = ExternalTaxTransactionSchema.safeParse(rawTx)
      if (result.success) {
        const dto = result.data
        parsed.push({
          id: TransactionIdSchema.parse(dto.id),
          type: dto.type,
          symbol: dto.symbol,
          amount: dto.amount,
          totalEur: dto.totalEur,
          priceEur: dto.priceEur,
          feeEur: dto.feeEur,
          timestamp: dto.timestamp,
          assetIn: dto.assetIn,
          assetOut: dto.assetOut,
          amountIn: dto.amountIn,
          amountOut: dto.amountOut,
          exchange: dto.exchange,
          refId: dto.refId,
        })
      }
    }
    return parsed
  }

  async getFuturesDerivatives(): Promise<TaxDerivativeEntity[]> {
    const res = await bffClient.api.tax.transactions['futures-derivatives'].$get()
    const rawArray = await res.json()

    const parsed: TaxDerivativeEntity[] = []
    for (const rawTx of (Array.isArray(rawArray) ? rawArray : [])) {
      const result = CexFuturesLedgerSchema.safeParse(rawTx)
      if (result.success) {
        parsed.push(result.data)
      }
    }
    return parsed
  }

  async getInvalidTransactions(): Promise<TaxTransactionEntity[]> {
    const res = await bffClient.api.tax.transactions.invalid.$get()
    const rawArray = await res.json()
    const parsed: TaxTransactionEntity[] = []

    for (const rawTx of (Array.isArray(rawArray) ? rawArray : [])) {
      const result = ExternalTaxTransactionSchema.safeParse(rawTx)
      if (result.success) {
        const dto = result.data
        parsed.push({
          id: TransactionIdSchema.parse(dto.id),
          type: dto.type,
          symbol: dto.symbol,
          amount: dto.amount,
          totalEur: dto.totalEur,
          priceEur: dto.priceEur,
          feeEur: dto.feeEur,
          timestamp: dto.timestamp,
        })
      }
    }
    return parsed
  }

  async getReport(year: number, method: string): Promise<TaxReportEntity> {
    const res = await bffClient.api.tax.report.$get({ query: { year: year.toString(), method } })
    const data = await res.json()
    const dto = parseOrFail(ExternalTaxReportSchema, data, `getReport(${year})`)

    return {
      year: dto.year,
      method: dto.method,
      summary: dto.summary,
      auditTrail: dto.auditTrail as TaxReportEntity['auditTrail'],
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    await bffClient.api.tax.transactions[':id'].$delete({ param: { id } })
  }

  async updateTransaction(id: string, data: Partial<TaxTransactionEntity>): Promise<void> {
    await bffClient.api.tax.transactions[':id'].$put({ param: { id }, json: data })
  }

  async validateTransaction(payload: Partial<TaxTransactionEntity>): Promise<void> {
    await bffClient.api.tax.transactions.validate.$post({ json: payload })
  }

  async uploadTaxFile(file: File, market: 'spot' | 'futures'): Promise<void> {
    try {
      await bffClient.api.tax.upload.$post({ form: { file, market } })
    } catch (err) {
      throw new TaxOperationError('UPLOAD_FAILED', `File upload failed: ${(err as Error).message}`)
    }
  }

  async deleteAllTransactions(market: 'spot' | 'futures'): Promise<void> {
    try {
      await bffClient.api.tax.transactions.market[':market'].$delete({ param: { market } })
    } catch (err) {
      throw new TaxOperationError('DELETE_FAILED', `Bulk delete failed: ${(err as Error).message}`)
    }
  }

  async importWallet(chain: string, address: string): Promise<void> {
    try {
      await bffClient.api.tax['import-wallet'].$post({ json: { chain, address } })
    } catch (err) {
      throw new TaxOperationError('IMPORT_FAILED', `Wallet import failed: ${(err as Error).message}`)
    }
  }

  async syncWeb3(): Promise<void> {
    try {
      await bffClient.api.tax['sync-web3'].$post({ json: {} })
    } catch (err) {
      throw new TaxOperationError('SYNC_FAILED', `Web3 sync failed: ${(err as Error).message}`)
    }
  }

  async downloadReport(year: number, format: 'pdf' | 'csv'): Promise<Blob> {
    try {
      const res = await bffClient.api.tax.report.download.$get({ query: { year: year.toString(), format } })
      return await res.blob()
    } catch (err) {
      throw new TaxOperationError('DOWNLOAD_FAILED', `Report download failed: ${(err as Error).message}`)
    }
  }
}
