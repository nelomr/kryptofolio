/**
 * The quantity-level regression net.
 *
 * One representative fee-bearing row (or leg pair) per real export, driven through the real column
 * mapper, the real normalizer and the real ingestion mapper, exactly as `typeLabelCoverage.spec.ts`
 * drives every label. What that net certifies is acceptance; this one certifies the digits — every
 * amount, fee and fee denomination the ledger persists must match the source's own text, not a
 * numerically-equal reformatting of it.
 *
 * `profileIdFor` calls `detectSourceProfile` on each row's own header list rather than naming a
 * profile by hand: a fixture that names its own profile would certify the appliers while leaving
 * detection itself untested, which is the exact failure shape this net exists to avoid (see this
 * change's design notes on a fixture that agrees with itself).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mocked } from 'vitest';
import {
  guessColumnMapping,
  mapToEntity,
  normalizeTransactionDirection,
  detectSourceProfile,
} from '@kryptofolio/core-domain';
import { deriveSubAccountId } from '@kryptofolio/shared-types';
import type { SourceProfileId } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase } from '../CsvIngestionUseCase.js';
import type { ILedgerPort, LedgerSpotTransaction, LedgerFuturesTransaction } from '../../../domain/ports/ILedgerPort';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import { NO_BACKFILL_SCHEDULER } from './support/noBackfillScheduler.js';
import {
  KRAKEN_SPOT_HEADERS, KRAKEN_SPOT_TRADE_EUR_LEG, KRAKEN_SPOT_TRADE_PLUME_LEG,
  KRAKEN_SPOT_DOUBLE_FEE_EUR_LEG, KRAKEN_SPOT_DOUBLE_FEE_ENA_LEG,
  KRAKEN_FUTURES_HEADERS, KRAKEN_FUTURES_TRADE_ROW,
  BITVAVO_HEADERS, BITVAVO_BUY_ROW,
  BITUNIX_HEADERS, BITUNIX_WITHDRAW_ROW,
  TANGEM_HEADERS, TANGEM_ACTIVATION_ROW,
  BIT2ME_HEADERS, BIT2ME_TRADE_ROW, BIT2ME_WITHDRAWAL_ROW,
} from './fixtures/quantityFidelityRows.js';

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

function makeUseCase(ledgerPort: Mocked<ILedgerPort>): CsvIngestionUseCase {
  return new CsvIngestionUseCase(
    ledgerPort,
    { getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1')) } as unknown as Mocked<IPriceProviderPort>,
    {
      getSetting: vi.fn().mockResolvedValue('EUR'),
      setSetting: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IUserSettingsPort>,
    NO_BACKFILL_SCHEDULER,
  );
}

/** Every row reaches the mapper through the same chain the wizard puts it through. */
function toSubmitted(headers: readonly string[], row: Record<string, unknown>, market: 'SPOT' | 'FUTURES') {
  const mapping = guessColumnMapping([...headers]);
  const mapped = mapToEntity({ ...row }, mapping, 0, market).mappedData;
  const directed = normalizeTransactionDirection(
    { ...mapped, tx_type: mapped.tx_type ?? null, metadata: mapped.metadata ?? {} },
    'UTC',
  );
  return { ...directed, account_id: ACCOUNT };
}

/**
 * The profile the row's own header row resolves to. Naming the identifier by hand would let this net
 * pass under a profile no real file would ever be read under.
 */
function profileIdFor(headers: readonly string[]): SourceProfileId {
  const detection = detectSourceProfile([...headers]);
  if (detection.kind !== 'RESOLVED') {
    throw new Error(`headers resolved to ${detection.kind}, not to one profile`);
  }
  return detection.profileId;
}

async function ingestSpot(headers: readonly string[], rows: Record<string, unknown>[]) {
  const profileId = profileIdFor(headers);
  const ledgerPort = makeLedgerPort();
  const result = await makeUseCase(ledgerPort).execute(
    rows.map((row) => toSubmitted(headers, row, 'SPOT')),
    'spot',
    profileId,
    'UTC',
  );
  return { profileId, result, saved: ledgerPort.saveSpotTransaction.mock.calls.map((c) => c[0] as LedgerSpotTransaction) };
}

async function ingestFutures(headers: readonly string[], rows: Record<string, unknown>[]) {
  const profileId = profileIdFor(headers);
  const ledgerPort = makeLedgerPort();
  const result = await makeUseCase(ledgerPort).execute(
    rows.map((row) => toSubmitted(headers, row, 'FUTURES')),
    'futures',
    profileId,
    'UTC',
  );
  return { profileId, result, saved: ledgerPort.saveFuturesTransaction.mock.calls.map((c) => c[0] as LedgerFuturesTransaction) };
}

describe('the quantity-level net: every amount, fee and fee denomination, digit for digit', () => {
  it('kraken_spot.csv — a PLUME/EUR trade, resolved to the kraken-spot profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestSpot(KRAKEN_SPOT_HEADERS, [
      KRAKEN_SPOT_TRADE_EUR_LEG,
      KRAKEN_SPOT_TRADE_PLUME_LEG,
    ]);

    expect(profileId).toBe('kraken-spot');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('BUY');
    // `5393.57839` and `13.48397` in the file: the scale the source wrote survives exactly.
    expect(tx.amount_in).toBe('5393.57839');
    expect(tx.asset_in_id).toBe('PLUME');
    expect(tx.fee_amount).toBe('13.48397');
    expect(tx.fee_asset_id).toBe('PLUME');
    // `-326.3115` in the file; only the sign is dropped, which is where the direction was read from.
    expect(tx.total_fiat).toBe('326.3115');
  });

  /**
   * `kraken_spot.csv`'s `TZ7N3Z-O5Z5O-ODPRUX` group states a fee on *both* legs, in two different
   * currencies — the EUR leg's own `1.0210`, confirmed by its balance arithmetic
   * (`500.0000 − 495.5398 − 1.0210 = 3.4392`, the row's own stated balance), and the ENA leg's
   * `1.86123`. `LedgerSpotTransaction` has one `fee_amount`/`fee_asset_id` pair, so the EUR fee has
   * nowhere to go and is silently absent from the persisted row. This is a measured, recorded gap,
   * not a regression this net introduces: it is pinned here so a future change to the fee model
   * cannot narrow this case's coverage without this test naming what changed.
   */
  it('kraken_spot.csv — KNOWN GAP: a trade with a stated fee on both legs loses the one this fee model has no field for', async () => {
    const { result, saved } = await ingestSpot(KRAKEN_SPOT_HEADERS, [
      KRAKEN_SPOT_DOUBLE_FEE_EUR_LEG,
      KRAKEN_SPOT_DOUBLE_FEE_ENA_LEG,
    ]);

    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.amount_in).toBe('959.50873');
    // The ENA-side fee survives...
    expect(tx.fee_amount).toBe('1.86123');
    expect(tx.fee_asset_id).toBe('ENA');
    // ...and the EUR-side fee of `1.0210` the source also charged is not persisted anywhere. If this
    // assertion ever starts failing because the EUR fee reappears, that is progress — update this
    // test to say so rather than deleting it.
    expect(tx.total_fiat).toBe('495.5398');
  });

  it('kraken_futures.csv — a futures trade, resolved to the kraken-futures profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestFutures(KRAKEN_FUTURES_HEADERS, [KRAKEN_FUTURES_TRADE_ROW]);

    expect(profileId).toBe('kraken-futures');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    // `realized pnl` and `fee`, trailing zeros included — not Decimal's canonical form.
    expect(tx.realized_pnl).toBe('-3.65210000000');
    expect(tx.fee_amount).toBe('0.16440000000');
    // Settles in the collateral the row names in `symbol`, not the contract's own asset.
    expect(tx.fee_asset_id).toBe('usd');
    // `realized funding`, not `funding rate` — the two columns are a fraction and an amount, and only
    // one of them belongs in `funding_amount`.
    expect(tx.funding_amount).toBe('0.00650000000');
  });

  it('bitvavo_spot.csv — a buy, resolved to the bitvavo-spot profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestSpot(BITVAVO_HEADERS, [BITVAVO_BUY_ROW]);

    expect(profileId).toBe('bitvavo-spot');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('BUY');
    expect(tx.amount_in).toBe('0.30338');
    expect(tx.asset_in_id).toBe('ETH');
    expect(tx.fee_amount).toBe('0.7499');
    expect(tx.fee_asset_id).toBe('EUR');
    // The reported total (`-499.81`) already contains the fee, so the basis is the total minus it.
    expect(tx.total_fiat).toBe('499.0601');
    expect(tx.price_fiat).toBe('1645');
  });

  it('bitunix_spot.csv — an on-chain withdrawal, resolved to the bitunix-spot profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestSpot(BITUNIX_HEADERS, [BITUNIX_WITHDRAW_ROW]);

    expect(profileId).toBe('bitunix-spot');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('TRANSFER_OUT');
    expect(tx.amount_out).toBe('546.844684');
    expect(tx.asset_out_id).toBe('ADA');
    expect(tx.fee_amount).toBe('1');
    expect(tx.fee_asset_id).toBe('ADA');
  });

  it('tangem_activacion_xrp.csv — its only row, resolved to the tangem profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestSpot(TANGEM_HEADERS, [TANGEM_ACTIVATION_ROW]);

    expect(profileId).toBe('tangem');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('BUY');
    expect(tx.amount_in).toBe('1.0');
    expect(tx.asset_in_id).toBe('XRP');
    expect(tx.flag).toBe('WALLET_ACTIVATION');
  });

  it('bit2me_spot_*.xlsx — a Trade, resolved to the bit2me-spot profile from its own header row', async () => {
    const { profileId, result, saved } = await ingestSpot(BIT2ME_HEADERS, [BIT2ME_TRADE_ROW]);

    expect(profileId).toBe('bit2me-spot');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('BUY');
    expect(tx.amount_in).toBe('1923.81685263');
    expect(tx.asset_in_id).toBe('JASMY');
    // Stated in the destination asset, unrelated to the fiat leg — D21's `FEE_AS_STATED` case.
    expect(tx.fee_amount).toBe('9.57098884');
    expect(tx.fee_asset_id).toBe('JASMY');
    expect(tx.total_fiat).toBe('50');
  });

  it('bit2me_spot_*.xlsx — a Withdrawal whose fee is the origen/destino gap, not the stated column (D21)', async () => {
    const { profileId, result, saved } = await ingestSpot(BIT2ME_HEADERS, [BIT2ME_WITHDRAWAL_ROW]);

    expect(profileId).toBe('bit2me-spot');
    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1);
    const [tx] = saved;
    expect(tx.tx_type).toBe('TRANSFER_OUT');
    expect(tx.amount_out).toBe('1.536429');
    expect(tx.asset_out_id).toBe('HBAR');
    // `2.236429 − 1.536429`, derived — not the stated `Comisión` column, which names EUR and would
    // put a fiat fee on a row with no fiat leg.
    expect(tx.fee_amount).toBe('0.7');
    expect(tx.fee_asset_id).toBe('HBAR');
  });
});
