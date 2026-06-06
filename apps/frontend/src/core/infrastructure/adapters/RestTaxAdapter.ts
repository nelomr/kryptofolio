/**
 * RestTaxAdapter — Production HTTP adapter for fiscal/tax data.
 *
 * Implements ITaxRepository using a real HTTP client. All incoming API
 * responses pass through Zod schemas (ExternalTaxTransactionSchema,
 * ExternalTaxReportSchema) before entering the domain. safeParse failures
 * emit to errorBus and throw a controlled DomainValidationError.
 *
 * The complex BUY/SELL/SWAP symbol resolution logic lives exclusively in
 * ExternalTaxTransactionSchema — this adapter simply delegates to it.
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { IHttpClient } from '@/core/domain/ports/IHttpClient'
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


// ---------------------------------------------------------------------------
// Helper — parse with safeParse, emit to bus on failure
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RestTaxAdapter implements ITaxRepository {
  private readonly http: IHttpClient

  constructor(http: IHttpClient) {
    this.http = http
  }

  async getSpotTransactions(): Promise<TaxTransactionEntity[]> {
    const response = await this.http.get<unknown[]>('/api/tax/transactions/spot')
    const rawArray = Array.isArray(response.data) ? response.data : []

    // Parse each transaction individually — failures are logged but don't crash the batch
    const parsed: TaxTransactionEntity[] = []
    for (const rawTx of rawArray) {
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
        // Single-row failure: log and emit but continue processing the rest
        console.warn('[RestTaxAdapter] Skipping invalid transaction:', result.error, rawTx)
        errorBus.emit('validation-error', {
          message: 'errors.validation.malformed_record',
          context: 'getTransactions/row',
          details: result.error,
        })
      }
    }
    return parsed
  }

  async getFuturesTransactions(): Promise<TaxTransactionEntity[]> {
    const response = await this.http.get<unknown[]>('/api/tax/transactions/futures')
    const rawArray = Array.isArray(response.data) ? response.data : []

    const parsed: TaxTransactionEntity[] = []
    for (const rawTx of rawArray) {
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
        errorBus.emit('validation-error', {
          message: 'errors.validation.malformed_record',
          context: 'getFuturesTransactions/row',
          details: result.error,
        })
      }
    }
    return parsed
  }

  async getFuturesDerivatives(): Promise<TaxDerivativeEntity[]> {
    const response = await this.http.get<unknown[]>('/api/tax/transactions/futures-derivatives')
    const rawArray = Array.isArray(response.data) ? response.data : []

    const parsed: TaxDerivativeEntity[] = []
    for (const rawTx of rawArray) {
      const result = CexFuturesLedgerSchema.safeParse(rawTx)
      if (result.success) {
        parsed.push(result.data)
      } else {
        console.warn('[RestTaxAdapter] Skipping invalid futures derivative entry:', result.error, rawTx)
        errorBus.emit('validation-error', {
          message: 'errors.validation.malformed_derivative',
          context: 'getFuturesDerivatives/row',
          details: result.error,
        })
      }
    }
    return parsed
  }

  async getInvalidTransactions(): Promise<TaxTransactionEntity[]> {
    const response = await this.http.get<unknown[]>('/api/tax/transactions/invalid')
    const rawArray = Array.isArray(response.data) ? response.data : []
    const parsed: TaxTransactionEntity[] = []

    for (const rawTx of rawArray) {
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
    const response = await this.http.get<unknown>(`/api/tax/report?year=${year}&method=${method}`)
    const dto = parseOrFail(ExternalTaxReportSchema, response.data, `getReport(${year})`)

    return {
      year: dto.year,
      method: dto.method,
      summary: dto.summary,
      auditTrail: dto.auditTrail as TaxReportEntity['auditTrail'],
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.http.delete(`/api/tax/transactions/${id}`)
  }

  async updateTransaction(id: string, data: Partial<TaxTransactionEntity>): Promise<void> {
    await this.http.put(`/api/tax/transactions/${id}`, data)
  }

  async validateTransaction(payload: Partial<TaxTransactionEntity>): Promise<void> {
    await this.http.post('/api/tax/transactions/validate', payload)
  }

  /**
   * Upload a fiscal file as multipart to /api/tax/upload.
   * @throws {TaxOperationError} with code 'UPLOAD_FAILED' on any error
   * @param market - Target market context ('spot' or 'futures')
   */
  async uploadTaxFile(file: File, market: 'spot' | 'futures'): Promise<void> {
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('market', market)
      await this.http.postForm('/api/tax/upload', fd)
    } catch (err) {
      throw new TaxOperationError('UPLOAD_FAILED', `File upload failed: ${(err as Error).message}`)
    }
  }

  /**
   * Delete all transactions via DELETE /api/tax/transactions/:market
   * @throws {TaxOperationError} with code 'DELETE_FAILED' on any error
   * @param market - Target market context ('spot' or 'futures')
   */
  async deleteAllTransactions(market: 'spot' | 'futures'): Promise<void> {
    try {
      await this.http.delete(`/api/tax/transactions/${market}`)
    } catch (err) {
      throw new TaxOperationError('DELETE_FAILED', `Bulk delete failed: ${(err as Error).message}`)
    }
  }

  /**
   * Import transactions from a blockchain wallet via the REST API.
   * POST /api/tax/import-wallet
   */
  async importWallet(chain: string, address: string): Promise<void> {
    try {
      await this.http.post('/api/tax/import-wallet', { chain, address })
    } catch (err) {
      throw new TaxOperationError('IMPORT_FAILED', `Wallet import failed: ${(err as Error).message}`)
    }
  }

  /**
   * Trigger a full on-chain sync for all configured wallets.
   * POST /api/tax/sync-web3
   */
  async syncWeb3(): Promise<void> {
    try {
      await this.http.post('/api/tax/sync-web3', {})
    } catch (err) {
      throw new TaxOperationError('SYNC_FAILED', `Web3 sync failed: ${(err as Error).message}`)
    }
  }

  /**
   * Download fiscal report as PDF or CSV.
   * GET /api/tax/report/download?year=YEAR&format=FORMAT
   * @throws {TaxOperationError} with code 'DOWNLOAD_FAILED' on any error
   */
  async downloadReport(year: number, format: 'pdf' | 'csv'): Promise<Blob> {
    try {
      const response = await this.http.get<Blob>(
        `/api/tax/report/download?year=${year}&format=${format}`,
      )
      return response.data as Blob
    } catch (err) {
      throw new TaxOperationError(
        'DOWNLOAD_FAILED',
        `Report download failed: ${(err as Error).message}`,
      )
    }
  }
}
