import type { ILedgerPort, LedgerSpotTransaction, LedgerFuturesTransaction } from '../../domain/ports/ILedgerPort';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import type { SpotTxType, FuturesTxType } from '@kryptofolio/shared-types';
import { SPOT_TX_TYPES, FUTURES_TX_TYPES, isFiatCurrencyCode } from '@kryptofolio/shared-types';
import { SOURCE_FORMAT_PROFILES, applyProfileToRow } from '@kryptofolio/core-domain';
import type { SourceProfileId } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';
import crypto from 'node:crypto';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';

export type IngestibleTransaction = TransactionMappedData & {
  account_id: string;
  /** REQUIRED: deterministic hash from @kryptofolio/core-domain generateIdHash — never optional */
  id_hash: string;
};

/** A row the batch refused, kept so the caller can show what was left out and why. */
export interface IngestionRejection {
  readonly idHash: string;
  readonly timestamp: string;
  readonly txType: string | null;
  readonly reason: string;
}

export interface IngestionResult {
  readonly persisted: number;
  readonly rejected: readonly IngestionRejection[];
  /**
   * Rows persisted with fiat magnitudes that could not be resolved.
   *
   * `total_fiat` is `NOT NULL` and non-negative, so an unknown magnitude is stored as `0` — the
   * same value a genuinely free acquisition would carry. This count is what distinguishes the two
   * at the boundary; downstream, the FIFO engine reads a recorded `0` as unresolved and flags the
   * derived rows `MISSING_PRICE`.
   */
  readonly unresolvedFiat: number;
}

/**
 * A source type with no mapping, raised rather than defaulted.
 *
 * Defaulting to `BUY` fabricated an acquisition out of an operation nobody had classified; silently
 * dropping the row would hide it just as well. Rejecting it by name is the only outcome the user can
 * act on.
 */
class UnmappedTransactionTypeError extends Error {
  constructor(rawTxType: string | null, timestamp: string) {
    super(`Unmapped transaction type '${rawTxType ?? ''}' in row at ${timestamp}`);
    this.name = 'UnmappedTransactionTypeError';
  }
}

function toSpotTxType(raw: string | null | undefined, timestamp: string): SpotTxType {
  const upper = (raw ?? '').toUpperCase() as SpotTxType;
  if (SPOT_TX_TYPES.includes(upper)) return upper;
  /**
   * `TRADE` and a bare `TRANSFER` are deliberately absent. Both name an operation without naming its
   * direction, and the normalizer keeps a movement's raw label precisely when
   * `classifyCustodyMovement` refused to resolve one — so a label reaching here carries that refusal.
   * Picking a direction anyway is how a withdrawal became an acquisition in the first place.
   */
  const map: Record<string, SpotTxType> = {
    BUY: 'BUY', SELL: 'SELL',
    DEPOSIT: 'DEPOSIT', WITHDRAWAL: 'WITHDRAWAL',
    TRANSFER_IN: 'TRANSFER_IN', TRANSFER_OUT: 'TRANSFER_OUT',
    FEE: 'FEE', REWARD: 'REWARD', AIRDROP: 'AIRDROP',
    STAKING: 'STAKING', MINING: 'MINING', SPEND: 'SPEND',
    SWAP: 'SWAP', MIGRATION_SWAP: 'MIGRATION_SWAP',
  };
  const mapped = map[upper];
  if (!mapped) throw new UnmappedTransactionTypeError(raw ?? null, timestamp);
  return mapped;
}

function toFuturesTxType(raw: string | null | undefined, timestamp: string): FuturesTxType {
  const upper = (raw ?? '').toUpperCase() as FuturesTxType;
  if (FUTURES_TX_TYPES.includes(upper)) return upper;
  /**
   * Keys are the labels real exports actually carry, uppercased by the normalizer — Kraken writes
   * `futures trade` and `funding rate change`, not `TRADE`.
   *
   * `CONVERSION` and `CROSS-EXCHANGE TRANSFER` are deliberately absent: a collateral conversion and a
   * venue-to-venue movement are not position events, and `FuturesTxType` has no member that means
   * either. Mapping them to `TRADE` invents a position that was never opened.
   */
  const map: Record<string, FuturesTxType> = {
    'FUTURES TRADE': 'TRADE',
    'FUTURES LIQUIDATION': 'LIQUIDATION',
    'FUNDING RATE CHANGE': 'FUNDING_FEE',
    REALIZED_PNL: 'SETTLEMENT', SETTLEMENT: 'SETTLEMENT',
    FUNDING: 'FUNDING_FEE', COMMISSION: 'FUNDING_FEE',
  };
  const mapped = map[upper];
  if (!mapped) throw new UnmappedTransactionTypeError(raw ?? null, timestamp);
  return mapped;
}

/** Keeps each market's transaction type in its own branch, so neither is widened to the other. */
type ResolvedTxType =
  | { market: 'spot'; txType: SpotTxType }
  | { market: 'futures'; txType: FuturesTxType };

/**
 * Reads the sub-wallet designation a source export carries alongside the account.
 *
 * It arrives under `metadata.wallet`: the column is not part of the canonical mapped shape, and the
 * metadata dictionary keeps it separate from `account_id` precisely because a compartment within an
 * account is not the account.
 */
function readWalletDesignation(row: IngestibleTransaction): string | undefined {
  const wallet = row.metadata?.wallet;
  return wallet && wallet.trim().length > 0 ? wallet : undefined;
}

function normalizeIsoTimestamp(raw?: string | null): string {
  if (!raw) return new Date().toISOString();
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return raw;
}

export class CsvIngestionUseCase {
  private ledgerPort: ILedgerPort;
  private priceProvider: IPriceProviderPort;
  private userSettingsPort: IUserSettingsPort;

  constructor(
    ledgerPort: ILedgerPort,
    priceProvider: IPriceProviderPort,
    userSettingsPort: IUserSettingsPort
  ) {
    this.ledgerPort = ledgerPort;
    this.priceProvider = priceProvider;
    this.userSettingsPort = userSettingsPort;
  }

  /**
   * `sourceProfileId` is required rather than defaulted, because which source wrote a file decides
   * how its fee column is read. The profile is resolved here rather than trusted from the client: a
   * row submitted by anything other than the wizard would otherwise be read under no profile at all,
   * and the applier is the same pure function the preview calls, so the two cannot disagree.
   */
  async execute(
    rows: IngestibleTransaction[],
    market: 'spot' | 'futures',
    sourceProfileId: SourceProfileId,
  ): Promise<IngestionResult> {
    const profile = SOURCE_FORMAT_PROFILES[sourceProfileId];
    const baseCurrency = (await this.userSettingsPort.getSetting('base_currency')) || 'USD';
    const rejected: IngestionRejection[] = [];
    let persisted = 0;
    let unresolvedFiat = 0;

    for (const rawRow of rows) {
      // Idempotent, so a row the wizard already applied it to reaches the identical figures.
      const row = applyProfileToRow(profile, rawRow);
      // 4.2 Orchestrate resolution of Asset and Account foreign keys.
      const venueAccountId = row.account_id;
      if (!venueAccountId) {
        throw new Error('Account ID is required for ingestion. The frontend MUST inject it before calling this use case.');
      }

      // C-7 fix: id_hash MUST come from the frontend's generateIdHash. It is never optional.
      if (!row.id_hash) {
        throw new Error(
          `id_hash is required for idempotent ingestion (tx at ${row.timestamp}). ` +
          'The frontend must call generateIdHash() before submitting rows.'
        );
      }

      // The type is resolved before any foreign key is created, so a rejected row leaves nothing
      // behind.
      let resolvedType: ResolvedTxType;
      try {
        resolvedType = market === 'spot'
          ? { market: 'spot', txType: toSpotTxType(row.tx_type, row.timestamp ?? '') }
          : { market: 'futures', txType: toFuturesTxType(row.tx_type, row.timestamp ?? '') };
      } catch (error) {
        if (!(error instanceof UnmappedTransactionTypeError)) throw error;
        rejected.push({
          idHash: row.id_hash,
          timestamp: row.timestamp ?? '',
          txType: row.tx_type ?? null,
          reason: error.message,
        });
        continue;
      }

      const accountId = await this.ensureAccountExists(venueAccountId, readWalletDesignation(row));

      if (row.asset_in) await this.ensureAssetExists(row.asset_in);
      if (row.asset_out) await this.ensureAssetExists(row.asset_out);
      if (row.fee_currency) await this.ensureAssetExists(row.fee_currency);

      // 4.3 Map valid TransactionMappedData payloads to Domain command via Adapter
      const id = crypto.randomUUID();
      const fiatCurrency = row.fiat_currency || baseCurrency;

      if (resolvedType.market === 'spot') {
        const fiat = await this.resolveFiatMagnitudes(row, fiatCurrency);
        if (!fiat.resolved) unresolvedFiat += 1;

        /**
         * The sign survives, unlike every other magnitude here. A negative fee is a rebate the
         * venue credited — Bitvavo's promotional row cancels its own `quantity × price` with one —
         * and taking its absolute value would charge the user for a discount. No export in the
         * corpus writes a *charged* fee as negative, so the sign carries no direction to normalise
         * away.
         */
        const feeAmountDec = row.fee_amount ? new Decimal(row.fee_amount) : new Decimal(0);
        const hasFee = !feeAmountDec.isZero();
        const feeAssetId = hasFee ? (row.fee_currency || row.asset_in || row.asset_out || undefined) : undefined;

        if (hasFee && !feeAssetId) {
          throw new Error(`Transaction at ${row.timestamp} has a fee amount but no fee currency or asset could be determined.`);
        }

        const tx: LedgerSpotTransaction = {
          id,
          id_hash: row.id_hash,
          account_id: accountId,
          timestamp: normalizeIsoTimestamp(row.timestamp),
          tx_type: resolvedType.txType,
          amount_in: row.amount_in ? toPreciseAmount(new Decimal(row.amount_in).abs().toString()) : undefined,
          asset_in_id: row.asset_in || undefined,
          amount_out: row.amount_out ? toPreciseAmount(new Decimal(row.amount_out).abs().toString()) : undefined,
          asset_out_id: row.asset_out || undefined,
          fee_amount: hasFee ? toPreciseAmount(feeAmountDec.toString()) : undefined,
          fee_asset_id: feeAssetId,
          total_fiat: toPreciseAmount(fiat.total.toString()),
          price_fiat: toPreciseAmount(fiat.unitPrice.toString()),
          fiat_currency: fiatCurrency,
          flag: row.fiscal_flag ?? undefined,
          status: 'COMPLETED',
        };
        await this.ledgerPort.saveSpotTransaction(tx);
        persisted += 1;
      } else {
        const feeAmountDec = row.fee_amount ? new Decimal(row.fee_amount).abs() : new Decimal(0);
        const hasFee = !feeAmountDec.isZero();
        const feeAssetId = hasFee ? (row.fee_currency || row.symbol || row.asset_in || row.asset_out || undefined) : undefined;

        if (hasFee && !feeAssetId) {
          throw new Error(`Transaction at ${row.timestamp} has a fee amount but no fee currency or asset could be determined.`);
        }

        const tx: LedgerFuturesTransaction = {
          id,
          id_hash: row.id_hash,
          account_id: accountId,
          timestamp: normalizeIsoTimestamp(row.timestamp),
          tx_type: resolvedType.txType,
          symbol: row.symbol ?? row.asset_in ?? row.asset_out ?? 'UNKNOWN',
          amount: row.amount_in ? toPreciseAmount(new Decimal(row.amount_in).abs().toString()) : row.amount_out ? toPreciseAmount(new Decimal(row.amount_out).abs().toString()) : undefined,
          realized_pnl: row.realized_pnl ? toPreciseAmount(row.realized_pnl) : undefined,
          funding_amount: row.funding_amount ? toPreciseAmount(row.funding_amount) : undefined,
          fee_amount: hasFee ? toPreciseAmount(feeAmountDec.toString()) : undefined,
          fee_asset_id: feeAssetId,
          fiat_currency: fiatCurrency,
          status: 'COMPLETED',
        };
        await this.ledgerPort.saveFuturesTransaction(tx);
        persisted += 1;
      }
    }

    if (persisted > 0) {
      await this.userSettingsPort.setSetting('needs_recalculation', 'true');
    }

    return { persisted, rejected, unresolvedFiat };
  }

  /**
   * Resolves the two fiat magnitudes as non-negative values, filling in only what the source left out.
   *
   * Direction is carried by `tx_type` and the directional asset fields, so a sign here is a modelling
   * error rather than information. A recorded magnitude is never replaced by a fetched price: the
   * source figure is what the user was actually charged.
   */
  private async resolveFiatMagnitudes(
    row: IngestibleTransaction,
    fiatCurrency: string,
  ): Promise<{ total: Decimal; unitPrice: Decimal; resolved: boolean }> {
    const quantity = new Decimal(row.amount_in || row.amount_out || '0').abs();
    let total = new Decimal(row.total_fiat || '0').abs();
    let unitPrice = new Decimal(row.price_fiat || '0').abs();

    if (total.isZero() && unitPrice.isZero()) {
      const primaryAsset = row.asset_in || row.asset_out;
      // A movement denominated in the reporting currency needs no price series: the quantity is
      // already the fiat magnitude. Without this a 10 € promotional credit resolves to 0 and the
      // income disappears from the general base it belongs to.
      if (primaryAsset && primaryAsset.toUpperCase() === fiatCurrency.toUpperCase()) {
        return { total: quantity, unitPrice: new Decimal(1), resolved: true };
      }
      if (primaryAsset) {
        unitPrice = await this.fetchUnitPrice(primaryAsset, fiatCurrency, row.timestamp);
      }
    }

    if (total.isZero() && !unitPrice.isZero()) {
      total = unitPrice.mul(quantity);
    } else if (unitPrice.isZero() && !total.isZero() && !quantity.isZero()) {
      unitPrice = total.div(quantity);
    }

    return { total, unitPrice, resolved: !total.isZero() || !unitPrice.isZero() };
  }

  /** A provider that cannot answer leaves the magnitude unresolved instead of failing the batch. */
  private async fetchUnitPrice(
    asset: string,
    fiatCurrency: string,
    timestamp: string | null | undefined,
  ): Promise<Decimal> {
    try {
      const price = await this.priceProvider.getHistoricalPrice(
        asset,
        fiatCurrency,
        timestamp ?? new Date().toISOString(),
      );
      return new Decimal(price).abs();
    } catch {
      return new Decimal(0);
    }
  }

  private async ensureAssetExists(asset: string): Promise<void> {
    await this.ledgerPort.ensureAssetExists({
      assetId: asset,
      symbol: asset,
      isFiat: isFiatCurrencyCode(asset),
    });
  }

  /** Returns the account the transaction belongs to, which may be a sub-wallet of the venue. */
  private async ensureAccountExists(
    accountId: string,
    wallet: string | undefined,
  ): Promise<string> {
    return this.ledgerPort.ensureAccountExists({ accountId, wallet });
  }
}
