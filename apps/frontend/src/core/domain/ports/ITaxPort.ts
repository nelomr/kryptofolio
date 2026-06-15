/**
 * ITaxPort — Port for tax and fiscal data access.
 *
 * This port abstracts the API Gateway operations for fiscal data (spot, futures)
 * and tax report generation.
 *
 * It is implemented by:
 *  - RestTaxAdapter (for production)
 *  - MockTaxAdapter (for local testing)
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { TaxTransactionEntity, TaxReportEntity, TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'
import type { TransactionRow } from '@/modules/data-ingestion/types'

export interface ITaxPort {
  /**
   * Fetch all spot tax-relevant transactions.
   */
  getSpotTransactions(): Promise<TaxTransactionEntity[]>

  /**
   * Fetch all futures tax-relevant transactions (legacy, generic shape).
   * @deprecated Prefer getFuturesDerivatives() for new UI components.
   */
  getFuturesTransactions(): Promise<TaxTransactionEntity[]>

  /**
   * Fetch futures/derivatives transactions mapped to the dedicated TaxDerivativeEntity.
   * Returns structured data with contractSymbol, realizedPnl, funding, and status fields
   * that are specific to derivatives and not expressible in the generic TaxTransactionEntity.
   */
  getFuturesDerivatives(): Promise<TaxDerivativeEntity[]>


  /**
   * Fetch spot transactions flagged as invalid or requiring manual review.
   */
  getInvalidTransactions(): Promise<TaxTransactionEntity[]>

  /**
   * Fetch a full tax report for a given fiscal year.
   * @param year - The fiscal year (e.g. 2024)
   * @param method - The calculation method ("FIFO" | "LIFO")
   */
  getReport(year: number, method: string): Promise<TaxReportEntity>

  /**
   * Fetch the list of available fiscal years from the transactions.
   */
  getAvailableYears(): Promise<number[]>

  /**
   * Soft-delete a transaction by ID.
   * @param id - The transaction's string ID
   */
  deleteTransaction(id: string): Promise<void>

  /**
   * Update a transaction with corrected data.
   * @param id - The transaction's string ID
   * @param data - Partial update payload
   */
  updateTransaction(id: string, data: Partial<TaxTransactionEntity>): Promise<void>

  /**
   * Validate and confirm a single flagged transaction.
   * @param payload - The corrected transaction data
   */
  validateTransaction(payload: Partial<TaxTransactionEntity>): Promise<void>

  /**
   * Upload a fiscal CSV/XLSX file for ingestion.
   * In MockTaxAdapter: parsed locally via papaparse/SheetJS (no network).
   * In RestTaxAdapter: multipart POST to /api/tax/upload.
   * @param file - The File object from an <input type="file"> element
   * @param market - Target market context ('spot' or 'futures')
   */
  uploadTaxFile(file: File, market: 'spot' | 'futures'): Promise<void>

  /**
   * Import an array of pre-parsed and validated transaction rows.
   * Uses a deterministic `id_hash` for each row to guarantee idempotent UPSERT operations.
   * @param rows - The array of validated TransactionRow objects.
   * @param market - Target market context ('spot' | 'futures')
   */
  importTransactions(rows: TransactionRow[], market: 'spot' | 'futures', timezone: string): Promise<void>

  /**
   * Delete all transactions — bulk state reset.
   * In MockTaxAdapter: clears the mutable in-memory _spotTransactions or _futuresTransactions array.
   * In RestTaxAdapter: DELETE /api/tax/transactions.
   * @param market - Target market context ('spot' or 'futures')
   * @throws {TaxOperationError} with code 'DELETE_FAILED' on failure
   */
  deleteAllTransactions(market: 'spot' | 'futures'): Promise<void>

  /**
   * Import transactions from a blockchain wallet address.
   * In RestTaxAdapter: POST /api/tax/import-wallet.
   * @param chain - The blockchain network (e.g. 'solana', 'hedera', 'ethereum')
   * @param address - The wallet or account address
   */
  importWallet(chain: string, address: string): Promise<void>

  /**
   * Trigger a full on-chain sync for all configured wallets.
   * In RestTaxAdapter: POST /api/tax/sync-web3.
   */
  syncWeb3(): Promise<void>

  /**
   * Download a fiscal report (PDF or CSV) for a given fiscal year.
   * In MockTaxAdapter: generates a placeholder Blob for development.
   * In RestTaxAdapter: streams the file from /api/tax/report/download.
   * @param year - The fiscal year (e.g. 2024)
   * @param format - The desired format ('pdf' | 'csv')
   * @returns A Blob representing the generated file
   */
  downloadReport(year: number, format: 'pdf' | 'csv'): Promise<Blob>
}
