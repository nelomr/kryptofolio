import {
  FIFO_QUALITY_FLAGS,
  FLAG_SEVERITIES,
  FLAG_SEVERITY,
  type FifoQualityFlag,
  type FlagSeverity,
} from '@kryptofolio/shared-types';
import type {
  FifoDataQualityRow,
  ITaxCalculatorPort,
} from '../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';

export interface GetFiscalIntegrityRequest {
  accountId?: string;
}

export interface FiscalIntegrityGroup {
  quality_flag: FifoQualityFlag;
  severity: FlagSeverity;
  count: number;
  /** Rows the user can resolve by declaring a value or a destination. */
  pendingReview: number;
  rows: FifoDataQualityRow[];
}

export interface FiscalIntegrityReport {
  groups: FiscalIntegrityGroup[];
  totalDefects: number;
  pendingReview: number;
  /** Derived figures are stale until the next rebuild succeeds. */
  needsRecalculation: boolean;
}

const NEEDS_RECALCULATION = 'needs_recalculation';

const FLAG_ORDER = new Map(FIFO_QUALITY_FLAGS.map((flag, index) => [flag, index]));

/** `FLAG_SEVERITIES` is ordered low → high, so its index is the ranking. */
function severityRank(severity: FlagSeverity): number {
  return FLAG_SEVERITIES.indexOf(severity);
}

/**
 * The pending-review surface: every data-quality defect, grouped, counted and ranked.
 *
 * Defects are never blocking, so this reports and returns — there is no failure path for a flagged
 * ledger. The pending-recalculation marker travels with the defects because both answer the same
 * question, and reading them apart would let the UI show a clean report over stale figures.
 */
export class GetFiscalIntegrityUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(taxCalculatorPort: ITaxCalculatorPort, userSettingsPort: IUserSettingsPort) {
    this.taxCalculatorPort = taxCalculatorPort;
    this.userSettingsPort = userSettingsPort;
  }

  public async execute(request: GetFiscalIntegrityRequest): Promise<FiscalIntegrityReport> {
    const [rows, pendingFlag] = await Promise.all([
      this.taxCalculatorPort.getDataQuality(request.accountId),
      this.userSettingsPort.getSetting(NEEDS_RECALCULATION),
    ]);

    return {
      ...groupDefects(rows),
      needsRecalculation: pendingFlag === 'true',
    };
  }
}

function groupDefects(rows: readonly FifoDataQualityRow[]): Omit<
  FiscalIntegrityReport,
  'needsRecalculation'
> {
  const groups = new Map<FifoQualityFlag, FiscalIntegrityGroup>();

  for (const row of rows) {
    let group = groups.get(row.quality_flag);
    if (!group) {
      group = {
        quality_flag: row.quality_flag,
        // Read from the shared vocabulary rather than from the row: one ranking in the system, so a
        // row carrying a stale severity cannot present a high-severity defect as a minor one.
        severity: FLAG_SEVERITY[row.quality_flag],
        count: 0,
        pendingReview: 0,
        rows: [],
      };
      groups.set(row.quality_flag, group);
    }

    group.count += 1;
    if (row.pending_review) group.pendingReview += 1;
    group.rows.push(row);
  }

  const ordered = [...groups.values()].sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      (FLAG_ORDER.get(a.quality_flag) ?? 0) - (FLAG_ORDER.get(b.quality_flag) ?? 0),
  );

  return {
    groups: ordered,
    totalDefects: rows.length,
    pendingReview: ordered.reduce((sum, group) => sum + group.pendingReview, 0),
  };
}
