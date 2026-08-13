/**
 * Orchestration of ingestion followed by materialisation.
 *
 * The two steps are doubled rather than run for real: what is under test is how many times each is
 * invoked and in which order, which a real DuckDB engine would make slower to observe and no more
 * convincing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestAndMaterializeUseCase } from '../IngestAndMaterializeUseCase.js';
import type { CsvIngestionUseCase, IngestibleTransaction, IngestionResult } from '../CsvIngestionUseCase.js';
import type {
  FifoMaterializerService,
  MaterializationSummary,
} from '../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

const RECALC_KEY = 'needs_recalculation';

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 } as const;

const SUMMARY: MaterializationSummary = {
  taxLots: { ...EMPTY_RECONCILIATION, inserted: 4 },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION, inserted: 2 },
  custodyEntries: { ...EMPTY_RECONCILIATION, inserted: 6 },
  flagged: 30,
  pendingReview: 30,
};

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  public readonly writes: Array<{ key: string; value: string }> = [];

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.writes.push({ key, value });
  }
}

function row(idHash: string, file: string): IngestibleTransaction {
  return {
    id_hash: idHash,
    account_id: 'acc-kraken',
    timestamp: '2026-01-04T10:00:00.000Z',
    tx_type: 'BUY',
    asset_in: 'XRP',
    amount_in: '10',
    total_fiat: '20',
    price_fiat: '2',
    metadata: { source_file: file },
  } as IngestibleTransaction;
}

/**
 * The two collaborators are concrete application classes, so a double has to be asserted onto their
 * type: an object literal cannot satisfy their private fields.
 */
function ingestionDouble(result: IngestionResult) {
  const execute = vi.fn(async () => result);
  return { double: { execute } as unknown as CsvIngestionUseCase, execute };
}

function materializerDouble(outcome: MaterializationSummary | Error) {
  const recalculate = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { double: { recalculate } as unknown as FifoMaterializerService, recalculate };
}

describe('IngestAndMaterializeUseCase', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
  });

  it('materialises exactly once for a 97-row batch', async () => {
    const rows = Array.from({ length: 97 }, (_, i) => row(`hash-${i}`, 'kraken_spot.csv'));
    const ingestion = ingestionDouble({ persisted: 97, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(SUMMARY);

    const result = await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows, market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(ingestion.execute).toHaveBeenCalledOnce();
    expect(materializer.recalculate).toHaveBeenCalledOnce();
    expect(result.materialized).toBe(true);
    expect(result.materialization).toEqual(SUMMARY);
    expect(result.ingestion.persisted).toBe(97);
  });

  it('materialises once when rows from several files arrive in one submission', async () => {
    const rows = [
      row('hash-a', 'kraken_spot.csv'),
      row('hash-b', 'bitvavo_spot.csv'),
      row('hash-c', 'bitunix_spot.csv'),
    ];
    const ingestion = ingestionDouble({ persisted: 3, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(SUMMARY);

    await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows, market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(ingestion.execute).toHaveBeenCalledOnce();
    expect(materializer.recalculate).toHaveBeenCalledOnce();
  });

  it('never recomputes per row', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`hash-${i}`, 'kraken_spot.csv'));
    const ingestion = ingestionDouble({ persisted: 12, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(SUMMARY);

    await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows, market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(materializer.recalculate).toHaveBeenCalledTimes(1);
  });

  it('does not materialise an empty batch, and sets no pending flag', async () => {
    const ingestion = ingestionDouble({ persisted: 0, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(SUMMARY);

    const result = await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows: [], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(materializer.recalculate).not.toHaveBeenCalled();
    expect(result.materialized).toBe(false);
    expect(result.materialization).toBeNull();
    expect(settings.writes).toEqual([]);
  });

  it('does not materialise a batch whose every row was rejected', async () => {
    // Nothing reached the ledger, so the derived tables cannot have moved. Counting the submitted
    // rows instead of the persisted ones would recompute the whole projection for nothing.
    const ingestion = ingestionDouble({
      persisted: 0,
      rejected: [
        {
          idHash: 'hash-a',
          timestamp: '2026-01-04T10:00:00.000Z',
          txType: 'CONVERSION',
          reason: "Unmapped transaction type 'CONVERSION' in row at 2026-01-04T10:00:00.000Z",
        },
      ],
      unresolvedFiat: 0,
      pendingFeeReview: [],
      invariant: { kind: 'NOT_DECLARED' },
    });
    const materializer = materializerDouble(SUMMARY);

    const result = await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows: [row('hash-a', 'kraken_spot.csv')], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(materializer.recalculate).not.toHaveBeenCalled();
    expect(result.ingestion.rejected).toHaveLength(1);
  });

  it('reports a failed rebuild without discarding the persisted rows', async () => {
    const ingestion = ingestionDouble({ persisted: 5, rejected: [], unresolvedFiat: 1, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(new Error('Catalog Error: v_custody_entries'));
    await settings.setSetting(RECALC_KEY, 'true');

    const result = await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows: [row('hash-a', 'kraken_spot.csv')], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(result.materialized).toBe(false);
    expect(result.materializationError).toContain('v_custody_entries');
    expect(result.ingestion.persisted).toBe(5);
    expect(await settings.getSetting(RECALC_KEY)).toBe('true');
  });

  it('leaves the pending flag set when the rebuild throws before the materialiser could clear it', async () => {
    const ingestion = ingestionDouble({ persisted: 5, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(new Error('disk I/O error'));

    await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows: [row('hash-a', 'kraken_spot.csv')], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(await settings.getSetting(RECALC_KEY)).toBe('true');
  });

  it('carries the pending-review count through to its own result', async () => {
    const ingestion = ingestionDouble({ persisted: 30, rejected: [], unresolvedFiat: 30, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } });
    const materializer = materializerDouble(SUMMARY);

    const result = await new IngestAndMaterializeUseCase(
      ingestion.double,
      materializer.double,
      settings,
    ).execute({ rows: [row('hash-a', 'kraken_spot.csv')], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(result.materialization?.pendingReview).toBe(30);
    expect(result.materialized).toBe(true);
  });

  it('ingests before it materialises', async () => {
    const order: string[] = [];
    const ingestionExecute = vi.fn(async () => {
      order.push('ingest');
      return { persisted: 1, rejected: [], unresolvedFiat: 0, pendingFeeReview: [], invariant: { kind: 'NOT_DECLARED' } };
    });
    const recalculate = vi.fn(async () => {
      order.push('materialise');
      return SUMMARY;
    });

    await new IngestAndMaterializeUseCase(
      { execute: ingestionExecute } as unknown as CsvIngestionUseCase,
      { recalculate } as unknown as FifoMaterializerService,
      settings,
    ).execute({ rows: [row('hash-a', 'kraken_spot.csv')], market: 'spot', sourceProfileId: 'kraken-spot', timezone: 'UTC' });

    expect(order).toEqual(['ingest', 'materialise']);
  });
});

describe('layer independence of the two composed steps', () => {
  const useCaseDir = path.resolve(import.meta.dirname, '..');

  const source = (file: string): string =>
    fs.readFileSync(path.join(useCaseDir, file), 'utf-8');

  it('leaves CsvIngestionUseCase with no reference to the materialiser', async () => {
    expect(source('CsvIngestionUseCase.ts')).not.toMatch(/Materializer/);
  });

  it('keeps CsvIngestionUseCase independently invocable', async () => {
    const { CsvIngestionUseCase: Ingestion } = await import('../CsvIngestionUseCase.js');
    // The ledger, the price provider, the settings and the backfill scheduler — each named in the
    // constructor below, so a fifth collaborator, or a fourth that is not the scheduler port,
    // fails here rather than passing on a count alone.
    expect(Ingestion.length).toBe(4);
    expect(source('CsvIngestionUseCase.ts')).toMatch(
      /constructor\(\s*ledgerPort: ILedgerPort,\s*priceProvider: IPriceProviderPort,\s*userSettingsPort: IUserSettingsPort,\s*backfillScheduler: IBackfillSchedulerPort\s*\)/,
    );
  });

  it('keeps the orchestrator free of any framework or HTTP dependency', () => {
    const orchestrator = source('IngestAndMaterializeUseCase.ts');
    const imports = [...orchestrator.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).not.toMatch(/^(hono|vue|axios|zod)/);
      expect(specifier).not.toMatch(/@hono\//);
    }
  });
});
