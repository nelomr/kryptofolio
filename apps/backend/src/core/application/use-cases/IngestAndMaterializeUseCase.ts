import type {
  CsvIngestionUseCase,
  IngestionResult,
  SubmittedTransaction,
} from './CsvIngestionUseCase.js';
import type {
  FifoMaterializerService,
  MaterializationSummary,
} from '../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { SourceProfileId } from '@kryptofolio/shared-types';

export interface IngestAndMaterializeInput {
  rows: SubmittedTransaction[];
  market: 'spot' | 'futures';
  /** Which source wrote the file. Required: no default can stand in for a measurement. */
  sourceProfileId: SourceProfileId;
}

/**
 * Outcome of one ingestion request: what reached the ledger, and what the rebuild that followed it
 * produced.
 *
 * `materialized` is separate from `materialization !== null` on purpose — a batch that persisted
 * nothing and a batch whose rebuild failed are both "no summary", and only the second is a problem
 * the user has to act on.
 */
export interface IngestAndMaterializeResult {
  ingestion: IngestionResult;
  /** Reconciliation outcome, or `null` when no rebuild was attempted or the attempt failed. */
  materialization: MaterializationSummary | null;
  materialized: boolean;
  materializationError: string | null;
}

/**
 * IngestAndMaterializeUseCase — persists a batch, then recomputes the FIFO projection once.
 *
 * The impure shell of the Functional Sandwich: it owns the ordering of the two steps so that neither
 * step has to know about the other, and so the HTTP layer has no sequencing decision to make.
 */
export class IngestAndMaterializeUseCase {
  private readonly ingestion: CsvIngestionUseCase;
  private readonly materializer: FifoMaterializerService;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(
    ingestion: CsvIngestionUseCase,
    materializer: FifoMaterializerService,
    userSettingsPort: IUserSettingsPort,
  ) {
    this.ingestion = ingestion;
    this.materializer = materializer;
    this.userSettingsPort = userSettingsPort;
  }

  async execute(input: IngestAndMaterializeInput): Promise<IngestAndMaterializeResult> {
    const ingestion = await this.ingestion.execute(input.rows, input.market, input.sourceProfileId);

    // Nothing persisted means the derived tables cannot have moved, so a full recompute would cost
    // a pass over the whole ledger to produce the set it already holds.
    if (ingestion.persisted === 0) {
      return {
        ingestion,
        materialization: null,
        materialized: false,
        materializationError: null,
      };
    }

    try {
      const materialization = await this.materializer.recalculate();
      return { ingestion, materialization, materialized: true, materializationError: null };
    } catch (error) {
      // The batch is not rolled back: the rows are valid and recorded, only the projection over them
      // is stale. Ingestion has already marked recalculation as pending, and a failed run never
      // reaches the clear, so the request stays retryable through the explicit rebuild endpoint.
      await this.userSettingsPort.setSetting('needs_recalculation', 'true');
      return {
        ingestion,
        materialization: null,
        materialized: false,
        materializationError: error instanceof Error ? error.message : 'Unknown rebuild error',
      };
    }
  }
}
