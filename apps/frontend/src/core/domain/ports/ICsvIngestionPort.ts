/**
 * ICsvIngestionPort — Secondary port for exchange-specific file parsers.
 *
 * Each exchange (Kraken, Bitvavo, BitUnix, Tangem, Bit2Me) implements this
 * interface. Despite the name, implementations handle both CSV and XLSX files.
 * The `rawRows` argument is always a plain-object array — the caller is
 * responsible for reading the file (papaparse for CSV, SheetJS for XLSX)
 * before passing rows to `parse()`.
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'

export interface ICsvIngestionPort {
  /**
   * Returns true if this parser recognises the given column headers.
   * Used for format auto-detection before `parse()` is called.
   * @param headers - Column names from the file header row
   */
  detect(headers: string[]): boolean

  /**
   * Parse raw row objects into clean TaxTransactionEntity instances.
   * Implementations MUST silently skip rows that cannot be mapped (no throw).
   * @param rawRows - Array of objects keyed by column header name
   */
  parse(rawRows: Record<string, string>[]): TaxTransactionEntity[]
}
