/**
 * CSV/XLSX Parser Registry — exports all registered exchange parsers.
 *
 * Order matters for detect() — parsers are checked in sequence.
 * Bit2Me should be checked BEFORE Tangem since Tangem is a "catch-all"
 * for simple formats.
 *
 * @see openspec/specs/fiscal-domain/spec.md
 */

import type { ICsvIngestionPort } from '@/core/domain/ports/ICsvIngestionPort'
import { KrakenSpotCsvParser } from './KrakenSpotCsvParser'
import { BitvavoCsvParser } from './BitvavoCsvParser'
import { BitUnixCsvParser } from './BitUnixCsvParser'
import { Bit2MeXlsxParser } from './Bit2MeXlsxParser'
import { TangemCsvParser } from './TangemCsvParser'

export { KrakenSpotCsvParser } from './KrakenSpotCsvParser'
export { BitvavoCsvParser } from './BitvavoCsvParser'
export { BitUnixCsvParser } from './BitUnixCsvParser'
export { TangemCsvParser } from './TangemCsvParser'
export { Bit2MeXlsxParser } from './Bit2MeXlsxParser'

/**
 * Ordered list of all supported exchange parsers.
 * MockTaxAdapter iterates this list via detect() to find the right parser.
 */
export const REGISTERED_PARSERS: ICsvIngestionPort[] = [
  new KrakenSpotCsvParser(),
  new BitvavoCsvParser(),
  new BitUnixCsvParser(),
  new Bit2MeXlsxParser(),
  new TangemCsvParser(), // Tangem last — catch-all for simple Date/Type/Asset/Amount/Fee/Notes formats
]
