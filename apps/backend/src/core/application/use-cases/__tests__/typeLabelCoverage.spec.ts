/**
 * The label-level regression net.
 *
 * Every distinct type label in every real export is driven through the real column mapper, the real
 * normalizer and the real ingestion mapper, and the result must be a type the ledger accepts. The
 * defect it exists to catch is a vocabulary gap: a label the exchange writes and no layer maps, which
 * is invisible to every unit test written from the canonical vocabulary outwards and shows up only as
 * a rejected row — or, worse, as a plausible default.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import {
  guessColumnMapping,
  mapToEntity,
  normalizeTransactionDirection,
} from '@kryptofolio/core-domain';
import { deriveSubAccountId } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import type { ILedgerPort } from '../../../domain/ports/ILedgerPort';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import { SOURCE_VOCABULARIES, type SourceVocabulary } from './fixtures/sourceTypeVocabularies.js';
import { detectSourceProfile } from '@kryptofolio/core-domain';
import type { SourceProfileId } from '@kryptofolio/shared-types';

const NO_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };
const ACCOUNT = '10000000-0000-0000-0000-000000000001';

/**
 * The two futures labels that stay rejected by decision: a collateral conversion and a venue-to-venue
 * transfer are not position events, and `futures_transactions` models position events. They move to
 * their own table in `add-futures-collateral-ledger`.
 */
const DEFERRED_FUTURES_LABELS = ['conversion', 'cross-exchange transfer'] as const;

/**
 * Labels whose direction is not in the label. This net submits one sample row per label, and a lone
 * `trade` leg has no second side to read a direction from — Kraken writes the same word on the leg
 * that spent and the leg that received. Rejecting it by name is the designed refusal; guessing is what
 * recorded every sale in the corpus as a purchase.
 *
 * Measured on the real export: all 20 `trade` rows form 10 pairs and none is left unpaired, so no real
 * row reaches the ledger this way. `tradeDirection.spec.ts` covers the paired path.
 */
const PAIRED_SPOT_LABELS = ['trade'] as const;

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

/** Every source label reaches the mapper through the same chain the wizard puts it through. */
function ingestibleFor(vocabulary: SourceVocabulary, label: string): IngestibleTransaction {
  const sample = vocabulary.labels.find((l) => l.label === label);
  if (!sample) throw new Error(`fixture has no sample row for '${label}'`);

  const mapping = guessColumnMapping([...vocabulary.headers]);
  const market = vocabulary.market === 'futures' ? 'FUTURES' : 'SPOT';
  const mapped = mapToEntity({ ...sample.row }, mapping, 0, market).mappedData;

  return {
    ...normalizeTransactionDirection({
      ...mapped,
      tx_type: mapped.tx_type ?? sample.row[vocabulary.typeColumn] ?? null,
      metadata: mapped.metadata ?? {},
    }, 'UTC'),
    account_id: ACCOUNT,
    id_hash: `hash-${vocabulary.source}-${label}`,
  };
}

/**
 * The profile each source's own header row resolves to, by the same call the wizard makes. Naming the
 * identifier by hand would let the net pass under a profile that no real file would ever be read
 * under; a header row that stops resolving to exactly one profile fails here instead.
 */
function profileIdFor(vocabulary: SourceVocabulary): SourceProfileId {
  const detection = detectSourceProfile([...vocabulary.headers]);
  if (detection.kind !== 'RESOLVED') {
    throw new Error(`${vocabulary.source} resolved to ${detection.kind}, not to one profile`);
  }
  return detection.profileId;
}

describe('every type label in every real export reaches a type the ledger accepts', () => {
  let useCase: CsvIngestionUseCase;
  let ledgerPort: Mocked<ILedgerPort>;

  beforeEach(() => {
    ledgerPort = makeLedgerPort();
    useCase = new CsvIngestionUseCase(
      ledgerPort,
      { getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1')) } as unknown as Mocked<IPriceProviderPort>,
      {
        getSetting: vi.fn().mockResolvedValue('EUR'),
        setSetting: vi.fn().mockResolvedValue(undefined),
      } as unknown as Mocked<IUserSettingsPort>,
    );
  });

  for (const vocabulary of SOURCE_VOCABULARIES) {
    describe(vocabulary.source, () => {
      for (const sample of vocabulary.labels) {
        const deferred =
          (vocabulary.market === 'futures' &&
            (DEFERRED_FUTURES_LABELS as readonly string[]).includes(sample.label)) ||
          (vocabulary.market === 'spot' &&
            (PAIRED_SPOT_LABELS as readonly string[]).includes(sample.label));

        it(`${deferred ? 'rejects by decision' : 'accepts'} '${sample.label}' (${sample.count} rows)`, async () => {
          const result = await useCase.execute(
            [ingestibleFor(vocabulary, sample.label)],
            vocabulary.market,
            profileIdFor(vocabulary), 'UTC',
          );

          if (deferred) {
            expect(result.persisted).toBe(0);
            // The rejection names the label the normalizer passed on, which is the source's own text
            // uppercased — unmapped is exactly the state that leaves it otherwise unchanged.
            expect(result.rejected.map((r) => r.txType)).toEqual([sample.label.toUpperCase()]);
            return;
          }

          expect(
            result.rejected.map((r) => r.reason),
            `'${sample.label}' from ${vocabulary.source} was rejected`,
          ).toEqual([]);
          expect(result.persisted).toBe(1);
        });
      }

      it('has a label vocabulary that still matches the file it was read from', () => {
        // Guards the fixture itself: a re-export that renames a label or changes its frequency must
        // be visible, since the whole net is only as real as the vocabulary behind it.
        expect(vocabulary.labels.length).toBeGreaterThan(0);
        for (const sample of vocabulary.labels) {
          expect(sample.label.trim(), `${vocabulary.source} has an empty label`).not.toBe('');
          expect(sample.count).toBeGreaterThan(0);
          expect(sample.row[vocabulary.typeColumn]).toBe(sample.label);
        }
      });
    });
  }

  it('covers all six real exports and every label in them', () => {
    expect(SOURCE_VOCABULARIES.map((v) => v.source)).toEqual([
      'kraken_spot.csv',
      'bitvavo_spot.csv',
      'bitunix_spot.csv',
      'tangem_activacion_xrp.csv',
      'kraken_futures.csv',
      'bit2me_spot_*.xlsx',
    ]);
    expect(SOURCE_VOCABULARIES.reduce((n, v) => n + v.labels.length, 0)).toBe(22);
  });
});
