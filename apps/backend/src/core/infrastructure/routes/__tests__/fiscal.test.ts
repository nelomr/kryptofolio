/**
 * Override routes: batched payloads, each entry validated by a Zod DTO before it reaches a use case.
 *
 * The container is doubled: what is under test is the anti-corruption boundary — which raw payloads
 * are refused, and what the accepted ones are converted into.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createFiscalApi } from '../fiscal.js';
import { OverrideValidationError } from '../../../application/use-cases/overrides/OverrideMutation.js';
import type { DIContainer } from '../../di/container.js';

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };

const SUMMARY = {
  taxLots: { ...EMPTY_RECONCILIATION, updated: 1 },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION },
  custodyEntries: { ...EMPTY_RECONCILIATION },
  flagged: 1,
  pendingReview: 1,
};

const INTEGRITY_ROW = {
  quality_flag: 'MISSING_PRICE',
  severity: 'medium',
  asset_id: 'XRP',
  account_id: 'acc-1',
  tx_id: 'tx-1',
  occurred_at: '2024-01-01T00:00:00.000Z',
  detail_key: 'fifo_quality.missing_price',
  pending_review: true,
};

const INTEGRITY_REPORT = {
  groups: [
    {
      quality_flag: 'MISSING_PRICE',
      severity: 'medium',
      count: 1,
      pendingReview: 1,
      rows: [INTEGRITY_ROW],
    },
  ],
  totalDefects: 1,
  pendingReview: 1,
  needsRecalculation: true,
};

function makeContainer(): DIContainer {
  const result = { applied: 1, materialization: SUMMARY };
  return {
    getFiscalIntegrityUseCase: { execute: vi.fn(async () => INTEGRITY_REPORT) },
    setManualPriceOverrideUseCase: { execute: vi.fn(async () => result) },
    removeManualPriceOverrideUseCase: { execute: vi.fn(async () => result) },
    setTransferDestinationUseCase: { execute: vi.fn(async () => result) },
    removeTransferDestinationUseCase: { execute: vi.fn(async () => result) },
  } as unknown as DIContainer;
}

const call = (container: DIContainer, name: keyof DIContainer) =>
  (container[name] as unknown as { execute: ReturnType<typeof vi.fn> }).execute;

describe('fiscal override routes', () => {
  let container: DIContainer;
  let app: Hono;

  beforeEach(() => {
    container = makeContainer();
    app = new Hono().route('/fiscal', createFiscalApi(container));
    vi.clearAllMocks();
  });

  const request = async (
    pathname: string,
    method: string,
    body: unknown,
  ): Promise<Response> =>
    app.request(pathname, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('accepts a batch of manual prices and reports the rebuild', async () => {
    const res = await request('/fiscal/overrides/prices', 'PUT', {
      overrides: [
        { id_hash: 'hash-a', price_fiat: '0.42', fiat_currency: 'EUR', note: 'statement' },
        { id_hash: 'hash-b', price_fiat: '1.15', fiat_currency: 'EUR' },
      ],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      applied: number;
      materialization: typeof SUMMARY | null;
      pendingReview: number;
    };
    expect(body.materialization).toEqual(SUMMARY);
    expect(body.pendingReview).toBe(1);

    const [inputs] = call(container, 'setManualPriceOverrideUseCase').mock.calls[0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual({
      idHash: 'hash-a',
      priceFiat: '0.42',
      fiatCurrency: 'EUR',
      note: 'statement',
    });
  });

  it('rejects a manual price with no currency without reaching the use case', async () => {
    const res = await request('/fiscal/overrides/prices', 'PUT', {
      overrides: [{ id_hash: 'hash-a', price_fiat: '0.42' }],
    });

    expect(res.status).toBe(400);
    expect(call(container, 'setManualPriceOverrideUseCase')).not.toHaveBeenCalled();
  });

  it('rejects a negative declared value', async () => {
    const res = await request('/fiscal/overrides/prices', 'PUT', {
      overrides: [{ id_hash: 'hash-a', price_fiat: '-0.42', fiat_currency: 'EUR' }],
    });

    expect(res.status).toBe(400);
    expect(call(container, 'setManualPriceOverrideUseCase')).not.toHaveBeenCalled();
  });

  it('rejects a declared value that arrives as a float', async () => {
    // A JSON number has already lost digits by the time it is parsed; the DTO refuses it so the
    // precision value object is the only way in.
    const res = await request('/fiscal/overrides/prices', 'PUT', {
      overrides: [{ id_hash: 'hash-a', price_fiat: 0.42, fiat_currency: 'EUR' }],
    });

    expect(res.status).toBe(400);
    expect(call(container, 'setManualPriceOverrideUseCase')).not.toHaveBeenCalled();
  });

  it('removes a batch of manual prices', async () => {
    const res = await request('/fiscal/overrides/prices', 'DELETE', {
      idHashes: ['hash-a', 'hash-b'],
    });

    expect(res.status).toBe(200);
    const [idHashes] = call(container, 'removeManualPriceOverrideUseCase').mock.calls[0];
    expect(idHashes).toEqual(['hash-a', 'hash-b']);
  });

  it('accepts a batch of transfer destinations', async () => {
    const res = await request('/fiscal/overrides/destinations', 'PUT', {
      overrides: [{ id_hash: 'hash-w', counterparty_account_id: 'acc-ledger' }],
    });

    expect(res.status).toBe(200);
    const [inputs] = call(container, 'setTransferDestinationUseCase').mock.calls[0];
    expect(inputs[0]).toEqual({
      idHash: 'hash-w',
      counterpartyAccountId: 'acc-ledger',
      note: undefined,
    });
  });

  it('removes a batch of transfer destinations', async () => {
    const res = await request('/fiscal/overrides/destinations', 'DELETE', {
      idHashes: ['hash-w'],
    });

    expect(res.status).toBe(200);
    const [idHashes] = call(container, 'removeTransferDestinationUseCase').mock.calls[0];
    expect(idHashes).toEqual(['hash-w']);
  });

  it('reports a rejected override as a client error, not a server failure', async () => {
    call(container, 'setTransferDestinationUseCase').mockRejectedValueOnce(
      new OverrideValidationError("Unknown counterparty account 'acc-ghost' for transaction hash-w"),
    );

    const res = await request('/fiscal/overrides/destinations', 'PUT', {
      overrides: [{ id_hash: 'hash-w', counterparty_account_id: 'acc-ghost' }],
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe('error');
    expect(body.message).toContain('acc-ghost');
  });

  it('reports an unexpected failure as a server error', async () => {
    call(container, 'setManualPriceOverrideUseCase').mockRejectedValueOnce(
      new Error('database is locked'),
    );

    const res = await request('/fiscal/overrides/prices', 'PUT', {
      overrides: [{ id_hash: 'hash-a', price_fiat: '0.42', fiat_currency: 'EUR' }],
    });

    expect(res.status).toBe(500);
  });

  it('rejects an empty identity, which would otherwise match no row at all', async () => {
    const res = await request('/fiscal/overrides/prices', 'DELETE', { idHashes: [''] });

    expect(res.status).toBe(400);
    expect(call(container, 'removeManualPriceOverrideUseCase')).not.toHaveBeenCalled();
  });

  it('returns the data-quality groups, counts and the pending marker', async () => {
    const res = await app.request('/fiscal/integrity');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(INTEGRITY_REPORT);
  });

  it('scopes the integrity report to the requested account', async () => {
    await app.request('/fiscal/integrity?accountId=acc-9');

    expect(call(container, 'getFiscalIntegrityUseCase')).toHaveBeenCalledWith({
      accountId: 'acc-9',
    });
  });

  it('refuses to emit a report that lost a field on its way out', async () => {
    call(container, 'getFiscalIntegrityUseCase').mockResolvedValueOnce({
      groups: [{ quality_flag: 'MISSING_PRICE', severity: 'medium', rows: [INTEGRITY_ROW] }],
      totalDefects: 1,
      pendingReview: 1,
      needsRecalculation: false,
    });

    const res = await app.request('/fiscal/integrity');

    expect(res.status).toBe(500);
  });

  it('refuses a severity outside the canonical vocabulary', async () => {
    call(container, 'getFiscalIntegrityUseCase').mockResolvedValueOnce({
      ...INTEGRITY_REPORT,
      groups: [{ ...INTEGRITY_REPORT.groups[0], severity: 'critical' }],
    });

    const res = await app.request('/fiscal/integrity');

    expect(res.status).toBe(500);
  });

  it('reports a clean ledger as an empty group list', async () => {
    call(container, 'getFiscalIntegrityUseCase').mockResolvedValueOnce({
      groups: [],
      totalDefects: 0,
      pendingReview: 0,
      needsRecalculation: false,
    });

    const res = await app.request('/fiscal/integrity');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      groups: [],
      totalDefects: 0,
      pendingReview: 0,
      needsRecalculation: false,
    });
  });
});