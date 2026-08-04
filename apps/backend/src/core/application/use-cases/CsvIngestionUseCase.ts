import type { ILedgerPort, LedgerSpotTransaction, LedgerFuturesTransaction } from '../../domain/ports/ILedgerPort';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import type { SpotTxType, FuturesTxType } from '@kryptofolio/shared-types';
import { SPOT_TX_TYPES, FUTURES_TX_TYPES, isFiatCurrencyCode } from '@kryptofolio/shared-types';
import {
  SOURCE_FORMAT_PROFILES,
  applyProfileToRow,
  checkProfileInvariant,
  generateIdHash,
  prepareIngestionRows,
  resolveFeeDenomination,
  resolveGrossNetFee,
  routeFee,
} from '@kryptofolio/core-domain';
import type { InvariantOutcome, SourceFormatProfile } from '@kryptofolio/core-domain';
import type { SourceProfileId } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';
import crypto from 'node:crypto';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';

/**
 * A row as the source wrote it, plus the account the user is importing into.
 *
 * Deliberately without an identifier. The identifier is derived here, from the row this use case is
 * about to persist — which is not the row a client could have hashed, because grouping the legs of a
 * trade happens on this side of the boundary now. A client-supplied key would also make re-ingesting
 * one file depend on the client version that submitted it.
 */
export type SubmittedTransaction = TransactionMappedData & {
  account_id: string;
};

/** A prepared row: classified, grouped, and identified by its own content. */
export type IngestibleTransaction = SubmittedTransaction & {
  id_hash: string;
};

/** A row the batch refused, kept so the caller can show what was left out and why. */
export interface IngestionRejection {
  readonly idHash: string;
  readonly timestamp: string;
  readonly txType: string | null;
  readonly reason: string;
}

/**
 * A row whose fee could not be resolved, reported rather than treated under a guessed convention.
 *
 * A *zero* fee never appears here: `gross = net + 0` under either convention, so the 40 real rows
 * that state an explicit zero are fully determined and have nothing for a user to decide.
 */
export interface FeePendingReview {
  readonly idHash: string;
  readonly timestamp: string;
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
  /** Rows persisted with a fee the source's profile could not resolve. */
  readonly pendingFeeReview: readonly FeePendingReview[];
  /**
   * The outcome of whatever redundancy the source ships independently of the profile's own
   * derivation. `NOT_DECLARED` is a stated fact, not an omission: a reviewer can see that the source
   * cannot check itself, which is what stops the absence of a check from looking like a passing one.
   */
  readonly invariant: InvariantOutcome;
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
    submitted: SubmittedTransaction[],
    market: 'spot' | 'futures',
    sourceProfileId: SourceProfileId,
  ): Promise<IngestionResult> {
    const profile = SOURCE_FORMAT_PROFILES[sourceProfileId];
    const baseCurrency = (await this.userSettingsPort.getSetting('base_currency')) || 'USD';
    const rejected: IngestionRejection[] = [];
    const pendingFeeReview: FeePendingReview[] = [];
    let persisted = 0;
    let unresolvedFiat = 0;

    /**
     * Checked over the batch as submitted, before anything is written or restructured. A running
     * balance is a chain, so a row left out — or a row whose `amount` a later step redistributed —
     * would report a break the file does not contain.
     */
    const invariant = checkProfileInvariant(profile, submitted);

    const { rows, refused } = await this.prepare(submitted, profile, market);
    rejected.push(...refused);

    for (const rawRow of rows) {
      // Idempotent, so a row the wizard already applied it to reaches the identical figures.
      const row = applyProfileToRow(profile, rawRow);
      // 4.2 Orchestrate resolution of Asset and Account foreign keys.
      const venueAccountId = row.account_id;
      if (!venueAccountId) {
        throw new Error('Account ID is required for ingestion. The frontend MUST inject it before calling this use case.');
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

        const fee = this.resolveFee(profile, row);
        if (fee.pending !== null) {
          pendingFeeReview.push({
            idHash: row.id_hash,
            timestamp: row.timestamp ?? '',
            reason: fee.pending,
          });
        }
        // A fee the source's reported total already contained is not added to it a second time.
        const total = fee.netTotal ?? fiat.total;

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
          fee_amount: fee.amount === null ? undefined : toPreciseAmount(fee.amount),
          fee_asset_id: fee.assetId,
          total_fiat: toPreciseAmount(total.toString()),
          price_fiat: toPreciseAmount(fiat.unitPrice.toString()),
          fiat_currency: fiatCurrency,
          flag: row.fiscal_flag ?? undefined,
          status: 'COMPLETED',
        };
        await this.ledgerPort.saveSpotTransaction(tx);
        persisted += 1;
      } else {
        /**
         * The same two appliers the spot branch uses. A futures fee settles in the account's
         * collateral, which is a declared property of the source and not the contract's asset — so
         * reading the symbol here regardless of the profile would reinstate the global default that
         * one export disproves inside itself. A stated zero keeps its denomination for the same
         * reason it does on the spot side: undenominated it can only be stored as the NULL that
         * means the source said nothing.
         */
        const fee = this.resolveFee(profile, row);
        if (fee.pending !== null) {
          pendingFeeReview.push({
            idHash: row.id_hash,
            timestamp: row.timestamp ?? '',
            reason: fee.pending,
          });
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
          fee_amount: fee.amount === null ? undefined : toPreciseAmount(fee.amount),
          fee_asset_id: fee.assetId,
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

    return { persisted, rejected, unresolvedFiat, pendingFeeReview, invariant };
  }

  /**
   * Resolves each row's direction, groups the legs of one operation, and identifies what results.
   *
   * All three steps sit behind the boundary on purpose. Direction first, because
   * `classifyCustodyMovement` reads the sign of a leg's own amount and grouping redistributes it;
   * grouping second, because the distinction between a trade and a movement is which side each leg is
   * on; the identifier last, because it must identify the row that is actually persisted.
   *
   * A group the aggregator refused carries fees in two units and no single figure can stand for both.
   * It is reported as a rejection rather than dropped: the batch continues, and the user is told which
   * operation was left out and why.
   */
  private async prepare(
    submitted: SubmittedTransaction[],
    profile: SourceFormatProfile,
    market: 'spot' | 'futures',
  ): Promise<{ rows: IngestibleTransaction[]; refused: IngestionRejection[] }> {
    const asRows = submitted.map((mappedData, index) => ({
      id: String(index),
      originalData: {},
      errors: [],
      hasError: false as const,
      mappedData,
    }));

    /**
     * Only spot rows are prepared. Both steps are spot-shaped: the classifier resolves custody and
     * funding, and the label map it belongs to is the spot vocabulary — putting a futures `trade`
     * through it yields `BUY`, a type the futures side has no member for. A position event has no
     * second leg to reunite either.
     */
    const prepared = market === 'spot' ? prepareIngestionRows(asRows, profile) : asRows;

    const rows: IngestibleTransaction[] = [];
    const refused: IngestionRejection[] = [];

    for (const row of prepared) {
      const mappedData = row.mappedData as SubmittedTransaction;
      const id_hash = await generateIdHash(mappedData);
      if (row.hasError) {
        refused.push({
          idHash: id_hash,
          timestamp: mappedData.timestamp ?? '',
          txType: mappedData.tx_type ?? null,
          reason: row.errors.join('; '),
        });
        continue;
      }
      rows.push({ ...mappedData, id_hash });
    }

    return { rows, refused };
  }

  /**
   * Turns the profile's two resolutions into what the ledger row must carry, for both markets: a
   * futures fee differs only in where its denomination comes from, which is the profile's business
   * and not this method's.
   *
   * Nothing here reads the source's name or a column of its own: the whole per-source decision was
   * already made by `resolveFeeDenomination` and `resolveGrossNetFee`, and the earlier fallback here
   * (`fee_currency || asset_in || asset_out`) is deleted rather than kept as a backstop — a global
   * default to the row's own asset is exactly the rule Bitvavo disproves, since one of its files mixes
   * a euro fee on a buy with an asset fee on a withdrawal.
   *
   * `amount` is a decimal string rather than a `number`; every figure on this path is monetary or a
   * quantity, and the sign survives because a negative fee is a rebate the venue credited.
   */
  private resolveFee(
    profile: SourceFormatProfile,
    row: IngestibleTransaction,
  ): {
    amount: string | null;
    assetId: string | undefined;
    /** The fiat magnitude to record when the source's total already contained the fee. */
    netTotal: Decimal | null;
    pending: string | null;
  } {
    const routing = routeFee(
      resolveFeeDenomination(profile, row),
      resolveGrossNetFee(profile, row),
    );

    switch (routing.kind) {
      case 'NO_FEE':
        // A stated zero keeps its denomination: the ledger's pair invariant admits no amount without
        // an asset, so an undenominated zero could only be stored as the NULL that means "unknown".
        return routing.stated && row.fee_currency
          ? { amount: '0', assetId: row.fee_currency, netTotal: null, pending: null }
          : { amount: null, assetId: undefined, netTotal: null, pending: null };

      case 'ASSET_DISPOSAL':
        return {
          amount: routing.quantity,
          assetId: routing.asset,
          netTotal: null,
          pending: null,
        };

      case 'BASIS_ADJUSTMENT':
        return {
          amount: routing.amount,
          assetId: routing.currency,
          netTotal: routing.netTotal === null ? null : new Decimal(routing.netTotal),
          pending: null,
        };

      case 'PENDING_REVIEW': {
        /**
         * The movement is persisted either way — dropping a real transfer to express doubt about its
         * fee would lose more than it protects. What the fee can carry depends on which half is
         * unresolved: a stated denomination is kept as written, and an unresolved one cannot be
         * written at all without inventing a unit.
         */
        const denomination = resolveFeeDenomination(profile, row);
        const statedUnit =
          denomination.kind === 'ASSET_QUANTITY'
            ? denomination.asset
            : denomination.kind === 'FIAT_VALUATION'
              ? denomination.currency
              : undefined;
        return statedUnit === undefined || !row.fee_amount
          ? { amount: null, assetId: undefined, netTotal: null, pending: routing.reason }
          : {
              amount: new Decimal(row.fee_amount).toString(),
              assetId: statedUnit,
              netTotal: null,
              pending: routing.reason,
            };
      }
    }
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
