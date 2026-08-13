/**
 * RestTaxAdapter — Production HTTP adapter for fiscal/tax data.
 *
 * Implements ITaxPort using Hono RPC (hc).
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type {
  ITaxPort,
  ManualPriceOverrideInput,
  TransferDestinationInput,
} from '@/core/domain/ports/ITaxPort'
import type {
  TaxTransactionEntity,
  TaxReportEntity,
  TaxDerivativeEntity,
  FiscalIntegrityReportEntity,
  IngestionOutcomeEntity,
  OverrideOutcomeEntity,
} from '@/core/domain/models/FiscalEntities'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'
import {
  ExternalTaxTransactionSchema,
  ExternalTaxReportSchema,
} from '@/core/infrastructure/dtos/ExternalTaxSchemas'
import {
  ExternalFiscalIntegritySchema,
  ExternalIngestionOutcomeSchema,
  ExternalOverrideOutcomeSchema,
} from '@/core/infrastructure/dtos/FiscalIntegritySchemas'
import { CexFuturesLedgerSchema } from '@/core/infrastructure/dtos/ExternalFuturesSchemas'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'
import { DomainValidationError } from './RestCryptoAdapter'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'
import { bffClient } from '../http/BffClient'
import type { SourceProfileId, TransactionRow } from '@kryptofolio/shared-types'

/**
 * Ingestion boundary conversion — `TransactionRow.mappedData` models an unset field as `null` (its
 * schema is `.nullable()`); the ingestion route models the same absence by omitting the key. Only the
 * fields the route names explicitly need the fold, one by one — everything else (`metadata`,
 * `fiscal_flag`, `transfer_group_id`, …) crosses through the route's own `passthrough()` untouched.
 * `account_id` is rejected rather than sent as `undefined`: a uuid column has no representation for
 * "unassigned", and the wizard already refuses to submit without one — reaching here without it is a
 * defect, not a value to guess at.
 */
function toIngestionPayloadRow(row: TransactionRow) {
  const { account_id, ...rest } = row.mappedData
  if (!account_id) {
    throw new Error('A row reached ingestion with no account assigned')
  }
  return {
    ...rest,
    account_id,
    timestamp: rest.timestamp ?? undefined,
    tx_type: rest.tx_type ?? undefined,
    asset_in: rest.asset_in ?? undefined,
    amount_in: rest.amount_in ?? undefined,
    asset_out: rest.asset_out ?? undefined,
    amount_out: rest.amount_out ?? undefined,
    fee_currency: rest.fee_currency ?? undefined,
    fee_amount: rest.fee_amount ?? undefined,
    total_fiat: rest.total_fiat ?? undefined,
    price_fiat: rest.price_fiat ?? undefined,
    symbol: rest.symbol ?? undefined,
    realized_pnl: rest.realized_pnl ?? undefined,
    funding_amount: rest.funding_amount ?? undefined,
  }
}

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

export class RestTaxAdapter implements ITaxPort {
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
      currency: dto.currency,
      conversion: dto.conversion,
      unconvertibleEvents: dto.unconvertibleEvents,
      summary: dto.summary,
      auditTrail: dto.auditTrail as TaxReportEntity['auditTrail'],
      excludedFlaggedEvents: dto.excludedFlaggedEvents,
      excludedUnresolvedIncomeCount: dto.excludedUnresolvedIncomeCount,
    }
  }

  async getAvailableYears(): Promise<number[]> {
    // If the backend lacks a dedicated endpoint, we calculate it here in the adapter
    // to keep the frontend completely pure and dumb.
    try {
      const txs = await this.getSpotTransactions()
      if (txs.length === 0) return [new Date().getFullYear()]
      return [...new Set(txs.map((tx) => new Date(tx.timestamp).getFullYear()))].sort(
        (a, b) => b - a,
      )
    } catch {
      return [new Date().getFullYear()]
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

  async importTransactions(rows: TransactionRow[], market: 'spot' | 'futures', timezone: string, sourceProfileId: SourceProfileId): Promise<IngestionOutcomeEntity> {
    try {
      const payload = rows.map((row) => toIngestionPayloadRow(row))
      const res = await bffClient.api.ingestion.transactions.$post({
        json: { rows: payload, market, timezone, sourceProfileId },
      });
      const rawData = await res.json()
      return parseOrFail(ExternalIngestionOutcomeSchema, rawData, 'importTransactions')
    } catch (err) {
      throw new TaxOperationError('IMPORT_FAILED', `Transactions import failed: ${(err as Error).message}`)
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

  async downloadReport(year: number, format: 'csv'): Promise<Blob> {
    try {
      const res = await bffClient.api.tax.report.download.$get({ query: { year: year.toString(), format } })
      return await res.blob()
    } catch (err) {
      throw new TaxOperationError('DOWNLOAD_FAILED', `Report download failed: ${(err as Error).message}`)
    }
  }

  async getFiscalIntegrity(accountId?: string): Promise<FiscalIntegrityReportEntity> {
    const res = await bffClient.api.fiscal.integrity.$get(
      accountId ? { query: { accountId } } : {},
    )
    const rawData = await res.json()
    return parseOrFail(ExternalFiscalIntegritySchema, rawData, 'getFiscalIntegrity')
  }

  async setManualPriceOverrides(
    overrides: ManualPriceOverrideInput[],
  ): Promise<OverrideOutcomeEntity> {
    const res = await bffClient.api.fiscal.overrides.prices.$put({
      json: {
        overrides: overrides.map((override) => ({
          id_hash: override.idHash,
          price_fiat: override.priceFiat,
          fiat_currency: override.fiatCurrency,
          note: override.note,
        })),
      },
    })
    return this.parseOverrideOutcome(res, 'setManualPriceOverrides')
  }

  async removeManualPriceOverrides(
    idHashes: TransactionIdHash[],
  ): Promise<OverrideOutcomeEntity> {
    const res = await bffClient.api.fiscal.overrides.prices.$delete({ json: { idHashes } })
    return this.parseOverrideOutcome(res, 'removeManualPriceOverrides')
  }

  async setTransferDestinations(
    overrides: TransferDestinationInput[],
  ): Promise<OverrideOutcomeEntity> {
    const res = await bffClient.api.fiscal.overrides.destinations.$put({
      json: {
        overrides: overrides.map((override) => ({
          id_hash: override.idHash,
          counterparty_account_id: override.counterpartyAccountId,
          note: override.note,
        })),
      },
    })
    return this.parseOverrideOutcome(res, 'setTransferDestinations')
  }

  async removeTransferDestinations(
    idHashes: TransactionIdHash[],
  ): Promise<OverrideOutcomeEntity> {
    const res = await bffClient.api.fiscal.overrides.destinations.$delete({ json: { idHashes } })
    return this.parseOverrideOutcome(res, 'removeTransferDestinations')
  }

  /**
   * A refused declaration is the user's to correct, so the message the backend wrote is carried
   * through rather than replaced — reporting it as an applied override would be the worse failure.
   */
  private async parseOverrideOutcome(
    res: { ok: boolean; json: () => Promise<unknown> },
    context: string,
  ): Promise<OverrideOutcomeEntity> {
    const rawData = await res.json()
    if (!res.ok) {
      const message =
        typeof rawData === 'object' && rawData !== null && 'message' in rawData
          ? String((rawData as { message: unknown }).message)
          : 'Override was rejected'
      throw new TaxOperationError('OVERRIDE_REJECTED', message)
    }
    return parseOrFail(ExternalOverrideOutcomeSchema, rawData, context)
  }
}
