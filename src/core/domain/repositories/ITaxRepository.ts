/**
 * ITaxRepository — Port for tax and fiscal data access.
 *
 * Defines the contract for all tax-related data operations. Adapters
 * implementing this interface will handle mapping the complex legacy API
 * shapes (asset_in/asset_out, tx_type, etc.) to clean domain entities.
 *
 * @see openspec/changes/hex-arch-zod-refactor/specs/fiscal-domain/spec.md
 */

import type { TaxTransactionEntity, TaxReportEntity } from '@/core/domain/models/FiscalEntities'

export interface ITaxRepository {
  /**
   * Fetch all tax-relevant transactions.
   */
  getTransactions(): Promise<TaxTransactionEntity[]>

  /**
   * Fetch transactions flagged as invalid or requiring manual review.
   */
  getInvalidTransactions(): Promise<TaxTransactionEntity[]>

  /**
   * Fetch a full tax report for a given fiscal year.
   * @param year - The fiscal year (e.g. 2024)
   * @param method - The calculation method ("FIFO" | "LIFO")
   */
  getReport(year: number, method: string): Promise<TaxReportEntity>

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
   */
  uploadTaxFile(file: File): Promise<void>

  /**
   * Delete all transactions — bulk state reset.
   * In MockTaxAdapter: clears the mutable in-memory _transactions array.
   * In RestTaxAdapter: DELETE /api/tax/transactions.
   * @throws {TaxOperationError} with code 'DELETE_FAILED' on failure
   */
  deleteAllTransactions(): Promise<void>
}
