import { describe, it, expect, vi } from 'vitest';
import { GetFiscalIntegrityUseCase } from '../GetFiscalIntegrityUseCase.js';
import type {
  FifoDataQualityRow,
  ITaxCalculatorPort,
} from '../../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

function row(overrides: Partial<FifoDataQualityRow>): FifoDataQualityRow {
  return {
    quality_flag: 'MISSING_PRICE',
    severity: 'medium',
    asset_id: 'XRP',
    account_id: 'acc-1',
    tx_id: 'tx-1',
    occurred_at: '2024-01-01T00:00:00.000Z',
    detail_key: 'fifo_quality.missing_price',
    pending_review: true,
    ...overrides,
  };
}

function makeUseCase(rows: FifoDataQualityRow[], needsRecalculation: string | null = null) {
  const taxCalculatorPort: ITaxCalculatorPort = {
    getSpanishTaxReport: vi.fn(),
    calculateLotsAndEvents: vi.fn().mockResolvedValue({ lots: [], events: [] }),
    calculateCustodyEntries: vi.fn().mockResolvedValue([]),
    getLotCustodyLocations: vi.fn().mockResolvedValue([]),
    getDataQuality: vi.fn().mockResolvedValue(rows),
  };
  const userSettingsPort: IUserSettingsPort = {
    getSetting: vi.fn().mockResolvedValue(needsRecalculation),
    setSetting: vi.fn(),
  };
  return {
    useCase: new GetFiscalIntegrityUseCase(taxCalculatorPort, userSettingsPort),
    taxCalculatorPort,
    userSettingsPort,
  };
}

describe('GetFiscalIntegrityUseCase', () => {
  it('groups defects by flag with a count per group', async () => {
    const { useCase } = makeUseCase([
      row({ tx_id: 'tx-1' }),
      row({ tx_id: 'tx-2' }),
      row({ quality_flag: 'CUSTODY_RESIDUAL', severity: 'low', tx_id: null, pending_review: false }),
    ]);

    const report = await useCase.execute({});

    expect(report.groups.map((g) => [g.quality_flag, g.count])).toEqual([
      ['MISSING_PRICE', 2],
      ['CUSTODY_RESIDUAL', 1],
    ]);
    expect(report.totalDefects).toBe(3);
  });

  it('orders groups by severity, highest first', async () => {
    const { useCase } = makeUseCase([
      row({ quality_flag: 'CUSTODY_RESIDUAL', severity: 'low' }),
      row({ quality_flag: 'MISSING_PRICE', severity: 'medium' }),
      row({ quality_flag: 'UNTRACKED_INFLOW', severity: 'high' }),
    ]);

    const report = await useCase.execute({});

    expect(report.groups.map((g) => g.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('reports the canonical severity even when the row disagrees', async () => {
    // One ranking in the system. A row arriving with a stale severity is reported at the severity
    // the shared vocabulary assigns, so the engine and the UI cannot disagree about urgency.
    const { useCase } = makeUseCase([row({ quality_flag: 'UNTRACKED_INFLOW', severity: 'low' })]);

    const report = await useCase.execute({});

    expect(report.groups[0].severity).toBe('high');
  });

  it('counts the rows a user can act on, per group and overall', async () => {
    const { useCase } = makeUseCase([
      row({ tx_id: 'tx-1', pending_review: true }),
      row({ tx_id: 'tx-2', pending_review: false }),
      row({ quality_flag: 'UNTRACKED_INFLOW', tx_id: 'tx-3', pending_review: true }),
    ]);

    const report = await useCase.execute({});

    const byFlag = new Map(report.groups.map((g) => [g.quality_flag, g]));
    expect(byFlag.get('MISSING_PRICE')?.pendingReview).toBe(1);
    expect(byFlag.get('UNTRACKED_INFLOW')?.pendingReview).toBe(1);
    expect(report.pendingReview).toBe(2);
  });

  it('carries each row through with the identity needed to assign a value', async () => {
    const { useCase } = makeUseCase([row({ tx_id: 'tx-42' })]);

    const report = await useCase.execute({});

    expect(report.groups[0].rows).toEqual([
      {
        quality_flag: 'MISSING_PRICE',
        severity: 'medium',
        asset_id: 'XRP',
        account_id: 'acc-1',
        tx_id: 'tx-42',
        occurred_at: '2024-01-01T00:00:00.000Z',
        detail_key: 'fifo_quality.missing_price',
        pending_review: true,
      },
    ]);
  });

  it('returns a healthy report for a clean ledger', async () => {
    const { useCase } = makeUseCase([]);

    const report = await useCase.execute({});

    expect(report.groups).toEqual([]);
    expect(report.totalDefects).toBe(0);
    expect(report.pendingReview).toBe(0);
    expect(report.needsRecalculation).toBe(false);
  });

  it('reports that derived figures are pending recalculation', async () => {
    const { useCase } = makeUseCase([], 'true');

    const report = await useCase.execute({});

    expect(report.needsRecalculation).toBe(true);
  });

  it('scopes the query to the requested account', async () => {
    const { useCase, taxCalculatorPort } = makeUseCase([]);

    await useCase.execute({ accountId: 'acc-9' });

    expect(taxCalculatorPort.getDataQuality).toHaveBeenCalledWith('acc-9');
  });

  it('never writes a setting while reporting', async () => {
    const { useCase, userSettingsPort } = makeUseCase([row({})], 'true');

    await useCase.execute({});

    expect(userSettingsPort.setSetting).not.toHaveBeenCalled();
  });
});
