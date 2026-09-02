import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { normalizeTransactionDirection } from '@kryptofolio/core-domain';
import { deriveSubAccountId } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import type { ILedgerPort, LedgerSpotTransaction } from '../../../domain/ports/ILedgerPort';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import { NO_BACKFILL_SCHEDULER } from './support/noBackfillScheduler.js';

const NO_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };
const ACCOUNT = '10000000-0000-0000-0000-000000000001';

function makeLedgerPort(): Mocked<ILedgerPort> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getSpotTransactions: vi.fn().mockResolvedValue([]),
    saveSpotTransaction: vi.fn().mockResolvedValue(undefined),
    getFuturesTransactions: vi.fn().mockResolvedValue([]),
    saveFuturesTransaction: vi.fn().mockResolvedValue(undefined),
    getCollateralMovements: vi.fn().mockResolvedValue([]),
    saveCollateralMovement: vi.fn().mockResolvedValue(undefined),
    getTaxLots: vi.fn().mockResolvedValue([]),
    getAccounts: vi.fn().mockResolvedValue([]),
    createTaxLot: vi.fn().mockResolvedValue(undefined),
    getLotHistoryEvents: vi.fn().mockResolvedValue([]),
    saveLotHistoryEvent: vi.fn().mockResolvedValue(undefined),
    runInTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
    reconcileTaxLots: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    reconcileLotHistoryEvents: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    reconcileCustodyEntries: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    getCustodyEntries: vi.fn().mockResolvedValue([]),
    getManualPriceOverrides: vi.fn().mockResolvedValue([]),
    setManualPriceOverride: vi.fn().mockResolvedValue(undefined),
    removeManualPriceOverride: vi.fn().mockResolvedValue(undefined),
    getTransferDestinationOverrides: vi.fn().mockResolvedValue([]),
    setTransferDestinationOverride: vi.fn().mockResolvedValue(undefined),
    removeTransferDestinationOverride: vi.fn().mockResolvedValue(undefined),
    ensureAssetExists: vi.fn().mockResolvedValue(undefined),
    ensureAccountExists: vi.fn(async (input: { accountId: string; wallet?: string | null }) =>
      deriveSubAccountId(input.accountId, input.wallet),
    ),
    getTrackedAssets: vi.fn().mockResolvedValue([]),
  } as Mocked<ILedgerPort>;
}

function makeUserSettingsPort(): Mocked<IUserSettingsPort> {
  return {
    getSetting: vi.fn().mockResolvedValue('EUR'),
    setSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<IUserSettingsPort>;
}

/** A provider that cannot answer, so every assertion below reads the source's own figures. */
function makeSilentPriceProvider(): Mocked<IPriceProviderPort> {
  return {
    getHistoricalPrice: vi.fn().mockRejectedValue(new Error('no price series in this test')),
  } as unknown as Mocked<IPriceProviderPort>;
}

describe('the real rows that the ingestion mapper used to reject', () => {
  let useCase: CsvIngestionUseCase;
  let ledgerPort: Mocked<ILedgerPort>;

  beforeEach(() => {
    ledgerPort = makeLedgerPort();
    useCase = new CsvIngestionUseCase(
      ledgerPort,
      makeSilentPriceProvider(),
      makeUserSettingsPort(),
      NO_BACKFILL_SCHEDULER,
    );
  });

  const saved = (): LedgerSpotTransaction =>
    ledgerPort.saveSpotTransaction.mock.calls[0]?.[0] as LedgerSpotTransaction;

  function ingestible(row: Record<string, string> & { tx_type: string }): IngestibleTransaction {
    return {
      ...normalizeTransactionDirection({ metadata: {}, ...row }, 'UTC'),
      account_id: ACCOUNT,
      id_hash: `hash-${row.tx_type}`,
    };
  }

  /** `tangem_activacion_xrp.csv`, its only data row. */
  const tangemActivation = () =>
    ingestible({
      date: '2025-06-03 10:01:00',
      tx_type: 'WALLET_ACTIVATION',
      asset: 'XRP',
      amount: '1.0',
      fee_amount: '0.0',
    });

  it('persists the Tangem activation instead of rejecting the whole file', async () => {
    const result = await useCase.execute([tangemActivation()], 'spot', 'tangem', 'UTC');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
  });

  it('records the activation as an acquisition of the reserved asset', async () => {
    await useCase.execute([tangemActivation()], 'spot', 'tangem', 'UTC');
    expect(saved().tx_type).toBe('BUY');
    expect(saved().asset_in_id).toBe('XRP');
    // The file states `1.0`, and that is what the ledger records.
    expect(saved().amount_in).toBe('1.0');
  });

  it('carries the fiscal classification onto the ledger transaction', async () => {
    await useCase.execute([tangemActivation()], 'spot', 'tangem', 'UTC');
    expect(saved().flag).toBe('WALLET_ACTIVATION');
  });

  it('leaves the classification unset for a row that states none', async () => {
    await useCase.execute(
      [ingestible({ date: '2025-06-03', tx_type: 'buy', asset: 'XRP', amount: '1.0' })],
      'spot',
      'bitvavo-spot', 'UTC',
    );
    expect(saved().flag).toBeUndefined();
  });

  /** `Europe/Madrid,2025-09-30,10:10:36,campaign_new_user_incentive,EUR,10,…` */
  const bitvavoPromotion = () =>
    ingestible({
      date: '2025-09-30',
      time: '10:10:36',
      tx_type: 'campaign_new_user_incentive',
      asset: 'EUR',
      amount: '10',
      fiat_currency: 'EUR',
    });

  it('persists the promotional credit under its own type', async () => {
    const result = await useCase.execute([bitvavoPromotion()], 'spot', 'bitvavo-spot', 'UTC');
    expect(result.rejected).toEqual([]);
    expect(saved().tx_type).toBe('PROMOTION');
  });

  it('records the credit at its face value, since the asset is the reporting currency itself', async () => {
    await useCase.execute([bitvavoPromotion()], 'spot', 'bitvavo-spot', 'UTC');
    expect(saved().total_fiat).toBe('10');
    expect(saved().price_fiat).toBe('1');
  });

  it('does not report the credit as an unresolved magnitude', async () => {
    const result = await useCase.execute([bitvavoPromotion()], 'spot', 'bitvavo-spot', 'UTC');
    expect(result.unresolvedFiat).toBe(0);
  });

  /** `…,buy,XRP,0.00449,EUR,1.211,EUR,-0.00,EUR,-0.00543739,…` — the fee is a credit. */
  const bitvavoNegativeFeeBuy = () =>
    ingestible({
      date: '2026-02-05',
      time: '07:05:35',
      tx_type: 'buy',
      asset_in: 'XRP',
      amount_in: '0.00449',
      asset_out: 'EUR',
      amount_out: '0.00',
      price_fiat: '1.211',
      fiat_currency: 'EUR',
      fee_amount: '-0.00543739',
      fee_currency: 'EUR',
    });

  it('keeps a negative fee negative, so the basis is credited and not charged twice', async () => {
    await useCase.execute([bitvavoNegativeFeeBuy()], 'spot', 'bitvavo-spot', 'UTC');
    expect(saved().fee_amount).toBe('-0.00543739');
    expect(saved().fee_asset_id).toBe('EUR');
  });

  it('still stores a charged fee as a positive magnitude', async () => {
    await useCase.execute(
      [
        ingestible({
          date: '2026-02-05',
          tx_type: 'buy',
          asset_in: 'ETH',
          amount_in: '0.30338',
          asset_out: 'EUR',
          amount_out: '499.81',
          price_fiat: '1645',
          fiat_currency: 'EUR',
          fee_amount: '0.7499',
          fee_currency: 'EUR',
        }),
      ],
      'spot',
      'bitvavo-spot', 'UTC',
    );
    expect(saved().fee_amount).toBe('0.7499');
  });
});
