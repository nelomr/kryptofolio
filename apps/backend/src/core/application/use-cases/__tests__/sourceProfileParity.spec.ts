/**
 * The preview and the ledger read one file the same way.
 *
 * A profile applied only in the browser would leave the wizard showing one quantity and the ledger
 * holding another, with nothing anywhere reporting the difference — and a row submitted by anything
 * other than the wizard would be read under no profile at all. So the identifier crosses the wire and
 * the backend resolves the profile itself, calling the same pure applier the preview calls.
 *
 * The rows below are verbatim from `bit2me_spot_2025.xlsx`. Bit2Me is the discriminating source: it
 * writes gross into `Cantidad de origen` and net into `Cantidad de destino`, so a persistence path
 * that ignores the profile records 2.236429 HBAR leaving a wallet from which 1.536429 actually left,
 * and records no disposal for the 0.7 HBAR the network took.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import {
  SOURCE_FORMAT_PROFILES,
  applyProfileToRow,
  guessColumnMapping,
  mapToEntity,
  normalizeTransactionDirection,
} from '@kryptofolio/core-domain';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import { deriveSubAccountId } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import type { ILedgerPort, LedgerSpotTransaction } from '../../../domain/ports/ILedgerPort';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

const NO_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };
const ACCOUNT = '10000000-0000-0000-0000-000000000001';

const BIT2ME_HEADERS = [
  'Tipo de operación',
  'Cantidad de destino',
  'Moneda de destino',
  'Cantidad de origen',
  'Moneda de origen',
  'Comisión de la operación',
  'Moneda de la comisión',
  'Exchange',
  'Grupo',
  'Descripción',
  'Fecha',
];

/** `2.236429 HBAR` left the account and `1.536429` arrived: the 0.7 difference is the network fee. */
const HBAR_WITHDRAWAL: Record<string, unknown> = {
  'Tipo de operación': 'Withdrawal',
  'Cantidad de destino': '1.536429',
  'Moneda de destino': 'HBAR',
  'Cantidad de origen': '2.236429',
  'Moneda de origen': 'HBAR',
  'Comisión de la operación': '0.210620368',
  'Moneda de la comisión': 'EUR',
  Exchange: 'Bit2Me',
  Grupo: 'blockchain',
  Descripción: 'wallet b83277f8-77d5-4591-a47e-309e35b4b779',
  Fecha: '2025-01-30 14:52',
};

/** A deposit writing the identical asset and amount onto both sides. */
const USDC_DEPOSIT: Record<string, unknown> = {
  'Tipo de operación': 'Deposit',
  'Cantidad de destino': '57.05766322',
  'Moneda de destino': 'USDC',
  'Cantidad de origen': '57.05766322',
  'Moneda de origen': 'USDC',
  'Comisión de la operación': '0',
  'Moneda de la comisión': 'EUR',
  Exchange: 'Bit2Me',
  Grupo: 'blockchain',
  Descripción: 'wallet 805fb527-2697-4052-97ae-51c13462b273',
  Fecha: '2025-01-30 16:42',
};

function makeLedgerPort(): Mocked<ILedgerPort> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getSpotTransactions: vi.fn().mockResolvedValue([]),
    saveSpotTransaction: vi.fn().mockResolvedValue(undefined),
    getFuturesTransactions: vi.fn().mockResolvedValue([]),
    saveFuturesTransaction: vi.fn().mockResolvedValue(undefined),
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

/** Silent on purpose: every figure asserted below is the source's own. */
function makeSilentPriceProvider(): Mocked<IPriceProviderPort> {
  return {
    getHistoricalPrice: vi.fn().mockRejectedValue(new Error('no price series in this test')),
  } as unknown as Mocked<IPriceProviderPort>;
}

/** Exactly what `usePreviewTable.generatePreview` builds when it is given a profile. */
function previewRow(raw: Record<string, unknown>): TransactionMappedData {
  const mapping = guessColumnMapping(BIT2ME_HEADERS);
  const mapped = mapToEntity(raw, mapping, 0, 'SPOT').mappedData as TransactionMappedData;
  return applyProfileToRow(SOURCE_FORMAT_PROFILES['bit2me-spot'], mapped);
}

/** What the wizard submits: the previewed row, direction-normalised, with an account and a hash. */
function submittable(row: TransactionMappedData, idHash: string): IngestibleTransaction {
  return {
    ...normalizeTransactionDirection(row),
    account_id: ACCOUNT,
    id_hash: idHash,
  } as IngestibleTransaction;
}

/** What an unaware client submits: the mapped row with no profile ever applied to it. */
function unprofiled(raw: Record<string, unknown>, idHash: string): IngestibleTransaction {
  const mapping = guessColumnMapping(BIT2ME_HEADERS);
  const mapped = mapToEntity(raw, mapping, 0, 'SPOT').mappedData as TransactionMappedData;
  return {
    ...normalizeTransactionDirection(mapped),
    account_id: ACCOUNT,
    id_hash: idHash,
  } as IngestibleTransaction;
}

describe('a Bit2Me file is read the same way on both sides of the ingestion boundary', () => {
  let useCase: CsvIngestionUseCase;
  let ledgerPort: Mocked<ILedgerPort>;

  beforeEach(() => {
    ledgerPort = makeLedgerPort();
    useCase = new CsvIngestionUseCase(
      ledgerPort,
      makeSilentPriceProvider(),
      makeUserSettingsPort(),
    );
  });

  const saved = () =>
    ledgerPort.saveSpotTransaction.mock.calls.map(([tx]) => tx as LedgerSpotTransaction);

  it('persists the quantity and the derived fee the preview showed, digit for digit', async () => {
    const previewed = previewRow(HBAR_WITHDRAWAL);
    // The preview is the reference, and it is a value the file does not state anywhere.
    expect(previewed.amount_out).toBe('1.536429');
    expect(previewed.fee_amount).toBe('0.7');
    expect(previewed.fee_currency).toBe('HBAR');

    const result = await useCase.execute(
      [unprofiled(HBAR_WITHDRAWAL, 'hash-hbar-unprofiled')],
      'spot',
      'bit2me-spot',
    );

    expect(result.rejected).toEqual([]);
    expect(saved()).toHaveLength(1);
    const tx = saved()[0];
    expect(tx.amount_out).toBe(previewed.amount_out);
    expect(tx.fee_amount).toBe(previewed.fee_amount);
    expect(tx.fee_asset_id).toBe(previewed.fee_currency);
    // The euro figure is a valuation of that fee, never a quantity of HBAR.
    expect(tx.fee_amount).not.toBe('0.210620368');
  });

  it('reaches the same figures whether or not the profile was already applied upstream', async () => {
    await useCase.execute(
      [unprofiled(HBAR_WITHDRAWAL, 'hash-a'), submittable(previewRow(HBAR_WITHDRAWAL), 'hash-b')],
      'spot',
      'bit2me-spot',
    );

    const [fresh, alreadyApplied] = saved();
    expect(alreadyApplied.amount_out).toBe(fresh.amount_out);
    expect(alreadyApplied.fee_amount).toBe(fresh.fee_amount);
    expect(alreadyApplied.fee_asset_id).toBe(fresh.fee_asset_id);
  });

  it('persists one directional side for a deposit that wrote both', async () => {
    const previewed = previewRow(USDC_DEPOSIT);
    expect(previewed.amount_in).toBe('57.05766322');
    expect(previewed.amount_out).toBeUndefined();

    await useCase.execute([unprofiled(USDC_DEPOSIT, 'hash-usdc')], 'spot', 'bit2me-spot');

    const tx = saved()[0];
    expect(tx.amount_in).toBe('57.05766322');
    expect(tx.amount_out).toBeUndefined();
    expect(tx.asset_out_id).toBeUndefined();
  });

  it('leaves a row untouched under a profile that declares no such rule', async () => {
    // The same file read as an unrecognised source: nothing is derived, so the gross figure stands.
    await useCase.execute([unprofiled(HBAR_WITHDRAWAL, 'hash-generic')], 'spot', 'generic');

    const tx = saved()[0];
    expect(tx.amount_out).toBe('2.236429');
  });
});
