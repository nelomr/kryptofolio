/**
 * TaxOperationError — Domain error for operation-level failures.
 *
 * Distinct from DomainValidationError (Zod failures). This class covers
 * higher-level operational failures: failed uploads, failed bulk deletes,
 * unsupported file formats, etc.
 *
 * Emits to errorBus 'operation-error' before the throw so the UI can
 * react (toast, banner) without coupling adapters to Vue components.
 *
 * @see openspec/specs/tax-operational-methods/spec.md
 */

import { errorBus } from './errorBus'

export type TaxOperationErrorCode =
  | 'UPLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'IMPORT_FAILED'
  | 'SYNC_FAILED'
  | 'DOWNLOAD_FAILED'
  // A declaration the backend refused: the user's to correct, not a server fault.
  | 'OVERRIDE_REJECTED'

export class TaxOperationError extends Error {
  readonly code: TaxOperationErrorCode

  constructor(code: TaxOperationErrorCode, message: string) {
    super(message)
    this.name = 'TaxOperationError'
    this.code = code

    // Emit to bus BEFORE throw so listeners can react synchronously
    errorBus.emit('operation-error', { code, message })
  }
}
