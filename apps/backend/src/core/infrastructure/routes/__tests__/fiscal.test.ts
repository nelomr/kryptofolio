/**
 * Override routes: batched payloads, each entry validated by a Zod DTO before it reaches a use case.
 *
 * The container is doubled: what is under test is the anti-corruption boundary — which raw payloads
 * are refused, and what the accepted ones are converted into.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createFiscalApi } from '../fiscal.js';
import {
  OverrideValidationError,
  OverrideNotFoundError,
} from '../../../application/use-cases/overrides/OverrideMutation.js';
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
  const spotResult = { applied: 1, materialization: SUMMARY, balanceCheck: { kind: 'CLEAN' } };
  return {
    getFiscalIntegrityUseCase: { execute: vi.fn(async () => INTEGRITY_REPORT) },
    setTransferDestinationUseCase: { execute: vi.fn(async () => result) },
    removeTransferDestinationUseCase: { execute: vi.fn(async () => result) },
    setSpotTransactionOverrideUseCase: { execute: vi.fn(async () => spotResult) },
    removeSpotTransactionOverrideUseCase: { execute: vi.fn(async () => result) },
  } as unknown as DIContainer;
}

/** All-UNCHANGED except one SET field, matching spotTransactionEditSchema's shape. */
function unchangedEditBody(overrides: Record<string, unknown> = {}) {
  const unchanged = { kind: 'UNCHANGED' };
  return {
    amount_in: unchanged,
    amount_out: unchanged,
    price_fiat: unchanged,
    total_fiat: unchanged,
    fee: unchanged,
    timestamp: unchanged,
    tx_type: unchanged,
    ...overrides,
  };
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

  // The manual-price-override PUT/DELETE cases that lived here were removed along with the
  // /overrides/prices routes (design.md D3).

  describe('PUT /overrides/transactions/:idHash', () => {
    it('validates against spotTransactionEditSchema, maps to the use case, and returns 200 with the balance check', async () => {
      const res = await request('/fiscal/overrides/transactions/hash-a', 'PUT', {
        ...unchangedEditBody({ price_fiat: { kind: 'SET', value: '42000', fiatCurrency: 'EUR' } }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        applied: number;
        materialization: typeof SUMMARY;
        balanceCheck: { kind: string };
      };
      expect(body.applied).toBe(1);
      expect(body.materialization).toEqual(SUMMARY);
      expect(body.balanceCheck).toEqual({ kind: 'CLEAN' });

      const [input] = call(container, 'setSpotTransactionOverrideUseCase').mock.calls[0];
      expect(input.idHash).toBe('hash-a');
      expect(input.priceFiat).toEqual({ kind: 'SET', value: '42000', fiatCurrency: 'EUR' });
      expect(input.amountIn).toEqual({ kind: 'UNCHANGED' });
    });

    it('rejects a payload the schema refuses (e.g. all-UNCHANGED) with 400, before reaching the use case', async () => {
      const res = await request('/fiscal/overrides/transactions/hash-a', 'PUT', unchangedEditBody());

      expect(res.status).toBe(400);
      expect(call(container, 'setSpotTransactionOverrideUseCase')).not.toHaveBeenCalled();
    });

    it('maps a use-case OverrideValidationError to 422 (custody-boundary rejection)', async () => {
      call(container, 'setSpotTransactionOverrideUseCase').mockRejectedValueOnce(
        new OverrideValidationError('cannot retype a custody movement'),
      );

      const res = await request('/fiscal/overrides/transactions/hash-a', 'PUT', {
        ...unchangedEditBody({ tx_type: { kind: 'SET', value: 'SELL' } }),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as { status: string; message: string };
      expect(body.message).toContain('custody movement');
    });

    it('maps a use-case OverrideNotFoundError to 404', async () => {
      call(container, 'setSpotTransactionOverrideUseCase').mockRejectedValueOnce(
        new OverrideNotFoundError('No spot transaction found for id_hash hash-ghost'),
      );

      const res = await request('/fiscal/overrides/transactions/hash-ghost', 'PUT', {
        ...unchangedEditBody({ price_fiat: { kind: 'SET', value: '1', fiatCurrency: 'EUR' } }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /overrides/transactions/:idHash', () => {
    it('returns 200 with the same response shape', async () => {
      const res = await request('/fiscal/overrides/transactions/hash-a', 'DELETE', undefined);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { applied: number; balanceCheck: { kind: string } };
      expect(body.applied).toBe(1);
      expect(body.balanceCheck).toEqual({ kind: 'CLEAN' });

      const [idHash] = call(container, 'removeSpotTransactionOverrideUseCase').mock.calls[0];
      expect(idHash).toBe('hash-a');
    });

    it('reports applied: 0 with no error for a hash with no active override', async () => {
      call(container, 'removeSpotTransactionOverrideUseCase').mockResolvedValueOnce({
        applied: 0,
        materialization: null,
      });

      const res = await request('/fiscal/overrides/transactions/hash-none', 'DELETE', undefined);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { applied: number; balanceCheck: { kind: string } };
      expect(body.applied).toBe(0);
      expect(body.balanceCheck).toEqual({ kind: 'CLEAN' });
    });
  });

  describe('the /overrides/prices routes are gone', () => {
    it('PUT /overrides/prices no longer exists', async () => {
      const res = await request('/fiscal/overrides/prices', 'PUT', { overrides: [] });
      expect(res.status).toBe(404);
    });

    it('DELETE /overrides/prices no longer exists', async () => {
      const res = await request('/fiscal/overrides/prices', 'DELETE', { idHashes: [] });
      expect(res.status).toBe(404);
    });
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
    call(container, 'setTransferDestinationUseCase').mockRejectedValueOnce(
      new Error('database is locked'),
    );

    const res = await request('/fiscal/overrides/destinations', 'PUT', {
      overrides: [{ id_hash: 'hash-w', counterparty_account_id: 'acc-ledger' }],
    });

    expect(res.status).toBe(500);
  });

  it('rejects an empty identity, which would otherwise match no row at all', async () => {
    const res = await request('/fiscal/overrides/destinations', 'DELETE', { idHashes: [''] });

    expect(res.status).toBe(400);
    expect(call(container, 'removeTransferDestinationUseCase')).not.toHaveBeenCalled();
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