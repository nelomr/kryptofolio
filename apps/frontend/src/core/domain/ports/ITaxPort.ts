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

import type {
  TaxTransactionEntity,
  TaxReportEntity,
  TaxDerivativeEntity,
  FiscalIntegrityReportEntity,
  IngestionOutcomeEntity,
  OverrideOutcomeEntity,
} from '@/core/domain/models/FiscalEntities'
import type { AccountId, TransactionIdHash } from '@/core/domain/models/BrandedTypes'
import type { SourceProfileId, TransactionRow, SpotTransactionEditInput } from '@kryptofolio/shared-types'
import type { SpotOverrideOutcomeEntity } from '@/core/domain/models/FiscalEntities'

// `ManualPriceOverrideInput` and its two port methods were removed here (design.md D3,
// add-spot-transaction-edit-overrides): `manual_price_overrides` was unified into
// `spot_transaction_overrides`. The replacement is `setSpotTransactionOverride`/
// `removeSpotTransactionOverride` below, whose price-only payload
// (`price_fiat: { kind: 'SET', ... }`, every other field `UNCHANGED`) covers the same case.

/** A correction naming the real counterparty of a custody movement. */
export interface TransferDestinationInput {
  idHash: TransactionIdHash
  counterpartyAccountId: AccountId
  note?: string
}

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

  // `deleteTransaction`/`updateTransaction` were removed here: they called the stub
  // `PUT/DELETE /api/tax/transactions/:id` routes (design.md, group 7), which returned
  // `{ success: true }` without ever touching the ledger and are now deleted. Neither had a real
  // caller in this codebase — `DeleteTransactionUseCase`/`UpdateTransactionUseCase` were dead code
  // wired to nothing. The real edit path is `setSpotTransactionOverride` below; deletion/creation
  // of transactions stays out of scope per this change's proposal.

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
   * The backend derives each row's `id_hash` from its own persisted content — the caller supplies
   * no identifier, so re-ingesting the same file resolves to the same rows regardless of which
   * client version submitted them.
   * @param rows - The array of validated TransactionRow objects.
   * @param market - Target market context ('spot' | 'futures')
   * @returns The batch's outcome — what was rejected, what fiat magnitude or fee could not be
   * resolved, and the rebuild that followed. Discarding it is how a decision the engine already made
   * (a rejected row, an unresolvable fee) used to never reach the person who could act on it.
   */
  importTransactions(
    rows: TransactionRow[],
    market: 'spot' | 'futures',
    timezone: string,
    sourceProfileId: SourceProfileId,
  ): Promise<IngestionOutcomeEntity>

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
   * @param format - The desired format ('csv')
   * @returns A Blob representing the generated file
   */
  downloadReport(year: number, format: 'csv'): Promise<Blob>

  /**
   * The data-quality defects the calculation engine found, grouped by flag.
   *
   * Read-only and advisory: defects are counted and reported, never blocking, so this never fails a
   * request that would otherwise succeed.
   * @param accountId - Optional account scope; omit for the whole ledger
   */
  getFiscalIntegrity(accountId?: string): Promise<FiscalIntegrityReportEntity>

  /** Declare the real counterparty of custody movements attributed to a synthetic account. */
  setTransferDestinations(overrides: TransferDestinationInput[]): Promise<OverrideOutcomeEntity>

  /** Withdraw declared counterparties, reverting to the inferred synthetic account. */
  removeTransferDestinations(idHashes: TransactionIdHash[]): Promise<OverrideOutcomeEntity>

  /**
   * Edit a spot transaction's P&L-relevant fields (design.md D8). Single hash, not a batch —
   * bulk edit is out of scope. `payload` is a full replacement of the override for that hash, not
   * a merge: a field left `UNCHANGED` here reverts it to unedited if it was previously edited.
   */
  setSpotTransactionOverride(
    idHash: TransactionIdHash,
    payload: SpotTransactionEditInput,
  ): Promise<SpotOverrideOutcomeEntity>

  /** Restores a spot transaction to its imported values by removing its override. */
  removeSpotTransactionOverride(idHash: TransactionIdHash): Promise<SpotOverrideOutcomeEntity>
}
