import { FIFO_QUALITY_FLAGS, FLAG_SEVERITY } from '@kryptofolio/shared-types';
import type { FiscalIntegrityReport } from '../../../../../application/use-cases/GetFiscalIntegrityUseCase.js';

/**
 * A report exercising every `FIFO_QUALITY_FLAG` (9 groups today), with a varying `count` per group
 * so the top-N-by-count ranking is independently verifiable, and several per-transaction rows per
 * group so "zero per-transaction rows reach the model" is a meaningful assertion rather than
 * vacuously true.
 */
export function buildFiscalIntegrityFixture(): FiscalIntegrityReport {
  const groups = FIFO_QUALITY_FLAGS.map((flag, index) => {
    const count = (FIFO_QUALITY_FLAGS.length - index) * 3;
    return {
      quality_flag: flag,
      severity: FLAG_SEVERITY[flag],
      count,
      pendingReview: Math.floor(count / 3),
      rows: Array.from({ length: count }, (_, i) => ({
        quality_flag: flag,
        severity: FLAG_SEVERITY[flag],
        asset_id: `asset-${flag.toLowerCase()}-${i}`,
        account_id: 'acc-1',
        tx_id: `tx-${flag.toLowerCase()}-${i}`,
        occurred_at: '2025-01-01',
        detail_key: `fifo_quality.${flag.toLowerCase()}`,
        pending_review: i % 3 === 0,
      })),
    };
  });

  return {
    groups,
    totalDefects: groups.reduce((sum, g) => sum + g.count, 0),
    pendingReview: groups.reduce((sum, g) => sum + g.pendingReview, 0),
    needsRecalculation: false,
  };
}
