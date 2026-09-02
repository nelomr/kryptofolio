import type {
  ILedgerPort,
  LedgerSpotTransaction,
  LedgerFuturesTransaction,
  LedgerCollateralMovement,
} from '../../domain/ports/ILedgerPort';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import type { SpotTxType, FuturesTxType, CollateralMovementType } from '@kryptofolio/shared-types';
import { SPOT_TX_TYPES, FUTURES_TX_TYPES, isFiatCurrencyCode } from '@kryptofolio/shared-types';
import {
  SOURCE_FORMAT_PROFILES,
  applyProfileToRow,
  checkProfileInvariant,
  generateIdHash,
  pairCollateralLegs,
  prepareIngestionRows,
  resolveFeeDenomination,
  resolveGrossNetFee,
  resolveRowIdentity,
  routeFee,
} from '@kryptofolio/core-domain';
import type { CollateralLegCandidate } from '@kryptofolio/core-domain';
import type { InvariantOutcome, SourceFormatProfile } from '@kryptofolio/core-domain';
import type { SourceProfileId } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';
import crypto from 'node:crypto';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IBackfillSchedulerPort } from '../../domain/ports/IBackfillSchedulerPort.js';
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
   * `total_fiat`/`price_fiat` are stored as `NULL` in this case — distinct from the `'0'` a
   * genuinely free acquisition carries. This count is a convenience for the caller; the
   * distinction itself lives in the recorded fact, not just in this number.
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

/**
 * The magnitude a source wrote, as it wrote it.
 *
 * `new Decimal(text).abs().toString()` returns the same number at a different scale — `7704.160`
 * becomes `7704.16` — so using Decimal to drop a sign also reformatted every quantity on its way to
 * the ledger. Decimal still decides whether the text is a number at all; it just no longer decides how
 * many digits the number has.
 */
function sourceMagnitude(text: string): string {
  if (!new Decimal(text).isFinite()) throw new RangeError(`not a finite quantity: '${text}'`);
  const trimmed = text.trim();
  return trimmed.startsWith('-') || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
}

/**
 * Whether a source row wrote a magnitude at all, as opposed to leaving the cell blank.
 *
 * `row.total_fiat || '0'` cannot make this distinction — `''` and `'0'` are both falsy — which is
 * exactly why a stated `0` used to be indistinguishable from an absent value. This is the one place
 * that reads the raw field before it collapses.
 */
function isStatedMagnitude(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * A directional leg: a quantity and the asset it is a quantity *of*, which only mean anything together.
 *
 * The ledger enforces that with `(amount_out IS NULL) = (asset_out_id IS NULL)`, so the pair cannot be
 * half-filled in storage — but nothing stopped it being half-filled on the way there. Bitunix writes
 * `Outgoing Amount: 0` against a blank `Outgoing Asset` on every deposit, and since the batch is one
 * request, that single row failed an entire file with a 500 and no row of it was persisted.
 *
 * An undenominated zero is nothing, not zero of something, so the leg is absent. An undenominated
 * quantity that is *not* zero is information this schema cannot hold, and is refused rather than
 * quietly dropped — dropping it would silently change a balance.
 */
type DirectionalLeg =
  | { readonly kind: 'ABSENT' }
  | { readonly kind: 'STATED'; readonly amount: string; readonly asset: string }
  | { readonly kind: 'UNDENOMINATED'; readonly amount: string };

function readLeg(amount: string | null | undefined, asset: string | null | undefined): DirectionalLeg {
  const magnitude = isStatedMagnitude(amount) ? sourceMagnitude(amount as string) : null;
  const symbol = asset === null || asset === undefined || asset === '' ? null : asset;

  if (magnitude === null) return { kind: 'ABSENT' };
  if (symbol !== null) return { kind: 'STATED', amount: magnitude, asset: symbol };
  return new Decimal(magnitude).isZero()
    ? { kind: 'ABSENT' }
    : { kind: 'UNDENOMINATED', amount: magnitude };
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

/**
 * The two futures labels that are not position events, keyed by the normalizer's uppercased text.
 *
 * Checked *before* `toFuturesTxType` is ever called: `FuturesTxType` has no member for either, by
 * design — a collateral conversion or a cross-venue transfer is not a trade, and mapping one to
 * `TRADE` would invent a position that was never opened.
 */
const COLLATERAL_LABELS: Readonly<Record<string, CollateralMovementType>> = {
  CONVERSION: 'CONVERSION',
  'CROSS-EXCHANGE TRANSFER': 'CROSS_EXCHANGE_TRANSFER',
};

/**
 * The magnitude a source wrote, sign included.
 *
 * Every other fiat/quantity field on this path is split into an unsigned magnitude plus a
 * direction carried by `tx_type` — `sourceMagnitude` above does exactly that. A collateral
 * movement is the deliberate exception: its two legs must sum to zero across currencies, which only
 * the signed value can express.
 */
function signedSourceMagnitude(text: string): string {
  if (!new Decimal(text).isFinite()) throw new RangeError(`not a finite quantity: '${text}'`);
  return text.trim();
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

/**
 * The earliest UTC date a prepared batch touches, or `null` where none of its rows is dated.
 *
 * Taken from the normalised timestamps, so a file written in a non-UTC zone cannot request a span
 * starting a day after the transaction it has to cover.
 */
export function oldestTransactionDate(rows: readonly IngestibleTransaction[]): string | null {
  let oldest: string | null = null;
  for (const row of rows) {
    if (!row.timestamp) continue;
    const date = normalizeIsoTimestamp(row.timestamp).slice(0, 10);
    if (oldest === null || date < oldest) oldest = date;
  }
  return oldest;
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
  private backfillScheduler: IBackfillSchedulerPort;

  constructor(
    ledgerPort: ILedgerPort,
    priceProvider: IPriceProviderPort,
    userSettingsPort: IUserSettingsPort,
    backfillScheduler: IBackfillSchedulerPort
  ) {
    this.ledgerPort = ledgerPort;
    this.priceProvider = priceProvider;
    this.userSettingsPort = userSettingsPort;
    this.backfillScheduler = backfillScheduler;
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
    /**
     * The zone the file's wall-clock times were written in. Required, because the alternative is
     * asserting every export is UTC — which silently reorders a day's trades, and FIFO is an ordering.
     */
    timezone: string,
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

    const { rows, refused } = await this.prepare(submitted, profile, market, timezone);
    rejected.push(...refused);

    // Computed once over the whole batch, before any row is persisted: pairing is a property of two
    // legs together, and the guard (same instant, opposing signs) can only be evaluated with every
    // candidate in view. See `pairCollateralLegs` — a leg with no partner stays unpaired rather than
    // guessed.
    const collateralPairIds: ReadonlyMap<string, string> =
      market === 'futures' ? this.resolveCollateralPairIds(rows) : new Map();

    for (const rawRow of rows) {
      // Idempotent, so a row the wizard already applied it to reaches the identical figures.
      const row = applyProfileToRow(profile, rawRow);
      // 4.2 Orchestrate resolution of Asset and Account foreign keys.
      const venueAccountId = row.account_id;
      if (!venueAccountId) {
        throw new Error('Account ID is required for ingestion. The frontend MUST inject it before calling this use case.');
      }

      const collateralType = market === 'futures' ? COLLATERAL_LABELS[(row.tx_type ?? '').toUpperCase()] : undefined;
      if (collateralType) {
        const rejection = await this.persistCollateralMovement(row, venueAccountId, collateralType, collateralPairIds);
        if (rejection) {
          rejected.push(rejection);
        } else {
          persisted += 1;
        }
        continue;
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
        const inbound = readLeg(row.amount_in, row.asset_in);
        const outbound = readLeg(row.amount_out, row.asset_out);
        const undenominated = [inbound, outbound].find(leg => leg.kind === 'UNDENOMINATED');
        if (undenominated?.kind === 'UNDENOMINATED') {
          rejected.push({
            idHash: row.id_hash,
            timestamp: row.timestamp ?? '',
            txType: row.tx_type ?? null,
            reason: `a quantity of ${undenominated.amount} names no asset, so it cannot be recorded`,
          });
          continue;
        }

        const fiat = await this.resolveFiatMagnitudes(row, fiatCurrency);
        if (fiat.kind === 'UNRESOLVED') unresolvedFiat += 1;

        const fee = this.resolveFee(profile, row);
        if (fee.pending !== null) {
          pendingFeeReview.push({
            idHash: row.id_hash,
            timestamp: row.timestamp ?? '',
            reason: fee.pending,
          });
        }
        // A fee the source's reported total already contained is not added to it a second time.
        // `fee.netTotal` is independently derived from the row's own gross/net convention, so it
        // stands in for the total even when `fiat` itself could not resolve one.
        const total = fee.netTotal ?? (fiat.kind === 'RESOLVED' ? fiat.total : null);

        const tx: LedgerSpotTransaction = {
          id,
          id_hash: row.id_hash,
          account_id: accountId,
          timestamp: normalizeIsoTimestamp(row.timestamp),
          tx_type: resolvedType.txType,
          amount_in: inbound.kind === 'STATED' ? toPreciseAmount(inbound.amount) : undefined,
          asset_in_id: inbound.kind === 'STATED' ? inbound.asset : undefined,
          amount_out: outbound.kind === 'STATED' ? toPreciseAmount(outbound.amount) : undefined,
          asset_out_id: outbound.kind === 'STATED' ? outbound.asset : undefined,
          fee_amount: fee.amount === null ? undefined : toPreciseAmount(fee.amount),
          fee_asset_id: fee.assetId,
          total_fiat: total === null ? null : toPreciseAmount(total.toString()),
          price_fiat: fiat.kind === 'RESOLVED' ? toPreciseAmount(fiat.unitPrice.toString()) : null,
          fiat_currency: fiatCurrency,
          flag: row.fiscal_flag ?? undefined,
          transfer_group_id: row.transfer_group_id ?? undefined,
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
          amount: row.amount_in ? toPreciseAmount(sourceMagnitude(row.amount_in)) : row.amount_out ? toPreciseAmount(sourceMagnitude(row.amount_out)) : undefined,
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
      this.requestFxCoverage(rows);
    }

    return { persisted, rejected, unresolvedFiat, pendingFeeReview, invariant };
  }

  /**
   * Asks for FX coverage of the span this batch just reached back into.
   *
   * Requested on every ingestion, not only the first: a later import may reach further back than
   * any before it, and "a backfill has already run" says nothing about the dates this batch needs.
   * Deduplication is the scheduler's business — it can see the ledger, this cannot.
   *
   * Failure here is swallowed on purpose. The rows are already persisted, and a missing rate is
   * already modelled: the affected figures report as unconvertible until the rates land. Letting it
   * escape would turn a network problem into a failed import of data that is safely on disk.
   */
  private requestFxCoverage(rows: readonly IngestibleTransaction[]): void {
    const oldest = oldestTransactionDate(rows);
    if (oldest === null) return;

    try {
      this.backfillScheduler.requestFxBackfill({
        from: oldest,
        to: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error('[CsvIngestionUseCase] Failed to request FX backfill', err);
    }
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
    timezone: string,
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
    const prepared = market === 'spot' ? prepareIngestionRows(asRows, profile, timezone) : asRows;

    const rows: IngestibleTransaction[] = [];
    const refused: IngestionRejection[] = [];

    for (const row of prepared) {
      const mappedData = row.mappedData as SubmittedTransaction;
      /**
       * Identity comes from the profile, never from whichever column happened to map to `tx_id`.
       * Bitunix's `Trx. ID` maps there and labels two separate ADA deposits with one value, so a
       * source that declares no identity must have it suppressed rather than merely unread.
       */
      const identity = resolveRowIdentity(profile, mappedData);
      const id_hash = await generateIdHash({
        ...mappedData,
        tx_id: identity.kind === 'DECLARED' ? identity.value : undefined,
      });
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
  /**
   * Pairs the batch's collateral legs up front, over every row regardless of which `IngestibleTransaction`
   * ultimately persists — the guard only sees a genuine pair when both legs are in view together.
   *
   * Only `CONVERSION` labels are candidates: a `cross-exchange transfer` has no counterpart in this
   * file by definition (its leg lives in a separate spot export), so it is never offered to the
   * guard and always comes out unpaired.
   */
  private resolveCollateralPairIds(rows: readonly IngestibleTransaction[]): ReadonlyMap<string, string> {
    const candidates: CollateralLegCandidate[] = [];
    for (const row of rows) {
      if ((row.tx_type ?? '').toUpperCase() !== 'CONVERSION') continue;
      if (!row.symbol || !row.amount) continue;
      candidates.push({
        idHash: row.id_hash,
        timestamp: normalizeIsoTimestamp(row.timestamp),
        currency: row.symbol.toUpperCase(),
        amount: signedSourceMagnitude(row.amount),
      });
    }
    return pairCollateralLegs(candidates);
  }

  /**
   * Persists one collateral leg (a conversion or a cross-venue transfer) and returns a rejection
   * when the row cannot be read at all — an undenominated or unparseable movement, which nothing in
   * the real corpus has produced but which the schema cannot silently accept either.
   *
   * `symbol` carries the currency here, never a contract: `futures_transactions.symbol` and this
   * field share a name but not a meaning, which is exactly why a collateral row does not reach that
   * table.
   */
  private async persistCollateralMovement(
    row: IngestibleTransaction,
    venueAccountId: string,
    movementType: CollateralMovementType,
    pairIds: ReadonlyMap<string, string>,
  ): Promise<IngestionRejection | null> {
    if (!row.symbol || !row.amount) {
      return {
        idHash: row.id_hash,
        timestamp: row.timestamp ?? '',
        txType: row.tx_type ?? null,
        reason: `a collateral movement needs both a currency and a signed amount; got symbol='${row.symbol ?? ''}' amount='${row.amount ?? ''}'`,
      };
    }

    let amount: string;
    try {
      amount = signedSourceMagnitude(row.amount);
    } catch (error) {
      return {
        idHash: row.id_hash,
        timestamp: row.timestamp ?? '',
        txType: row.tx_type ?? null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const spreadRaw = row.metadata?.['conversion spread percentage'];
    let spreadPct: string | null;
    try {
      spreadPct = isStatedMagnitude(spreadRaw) ? signedSourceMagnitude(spreadRaw as string) : null;
    } catch (error) {
      return {
        idHash: row.id_hash,
        timestamp: row.timestamp ?? '',
        txType: row.tx_type ?? null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const accountId = await this.ensureAccountExists(venueAccountId, readWalletDesignation(row));

    const movement: LedgerCollateralMovement = {
      id: crypto.randomUUID(),
      id_hash: row.id_hash,
      account_id: accountId,
      movement_type: movementType,
      currency: row.symbol.toUpperCase(),
      amount: toPreciseAmount(amount),
      spread_pct: spreadPct === null ? undefined : toPreciseAmount(spreadPct),
      pair_id: pairIds.get(row.id_hash) ?? null,
      timestamp: normalizeIsoTimestamp(row.timestamp),
      status: 'COMPLETED',
    };
    await this.ledgerPort.saveCollateralMovement(movement);
    return null;
  }

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
   * source figure is what the user was actually charged — which is why a *stated* value, `0`
   * included, is respected outright and never sent through a market lookup. Only the true absence
   * of both fields — nothing stated, nothing derivable — is `UNRESOLVED`.
   */
  private async resolveFiatMagnitudes(
    row: IngestibleTransaction,
    fiatCurrency: string,
  ): Promise<{ kind: 'RESOLVED'; total: Decimal; unitPrice: Decimal } | { kind: 'UNRESOLVED' }> {
    const totalStated = isStatedMagnitude(row.total_fiat);
    const priceStated = isStatedMagnitude(row.price_fiat);
    const quantity = new Decimal(row.amount_in || row.amount_out || '0').abs();
    let total = new Decimal(row.total_fiat || '0').abs();
    let unitPrice = new Decimal(row.price_fiat || '0').abs();

    if (!totalStated && !priceStated) {
      const primaryAsset = row.asset_in || row.asset_out;
      // A movement denominated in the reporting currency needs no price series: the quantity is
      // already the fiat magnitude. Without this a 10 € promotional credit resolves to 0 and the
      // income disappears from the general base it belongs to.
      if (primaryAsset && primaryAsset.toUpperCase() === fiatCurrency.toUpperCase()) {
        return { kind: 'RESOLVED', total: quantity, unitPrice: new Decimal(1) };
      }
      if (primaryAsset) {
        unitPrice = await this.fetchUnitPrice(primaryAsset, fiatCurrency, row.timestamp);
      }
    }

    if (!totalStated && !unitPrice.isZero()) {
      total = unitPrice.mul(quantity);
    } else if (!priceStated && !total.isZero() && !quantity.isZero()) {
      unitPrice = total.div(quantity);
    }

    const totalKnown = totalStated || !total.isZero();
    const priceKnown = priceStated || !unitPrice.isZero();
    return totalKnown || priceKnown
      ? { kind: 'RESOLVED', total, unitPrice }
      : { kind: 'UNRESOLVED' };
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
