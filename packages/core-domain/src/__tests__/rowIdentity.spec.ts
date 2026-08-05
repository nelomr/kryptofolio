/**
 * A source row's identity, and why content cannot supply it.
 *
 * `bit2me_spot_2024.xlsx` contains two byte-identical ADA fills at the same minute — same quantity,
 * same consideration, same fee — that are two distinct operations, each with its own UUID in the
 * source's `Descripción` column. A content-derived `id_hash` collides on them, the ledger's
 * `ON CONFLICT(id_hash) DO UPDATE` merges the second into the first, and 19.998 ADA vanishes from the
 * FIFO queue while the import still reports every row ingested. Measured on the real file: 59 rows in,
 * 58 in the ledger.
 *
 * The identity is therefore read from where the source writes it, declared per profile. It is not
 * guessed from a column name: `description` / `memo` / `notes` hold free text in other exports, and a
 * global synonym would turn that free text into an identifier for every source alike.
 */

import { describe, it, expect } from 'vitest';
import { generateIdHash } from '../domain/services/TransactionHashService';
import { resolveRowIdentity } from '../domain/services/sourceProfile/appliers';
import { SOURCE_FORMAT_PROFILES } from '../domain/services/sourceProfile/profiles';
import type { TransactionMappedData } from '@kryptofolio/shared-types';

const BIT2ME = SOURCE_FORMAT_PROFILES['bit2me-spot'];
const KRAKEN = SOURCE_FORMAT_PROFILES['kraken-spot'];
const GENERIC = SOURCE_FORMAT_PROFILES.generic;

/** The two real ADA rows, identical in every field the content hash reads. */
const adaFill = (description: string): TransactionMappedData =>
  ({
    timestamp: '2024-12-17T00:07:00.000Z',
    tx_type: 'BUY',
    asset_in: 'ADA',
    amount_in: '19.9980002',
    total_fiat: '20.32956704',
    fiat_currency: 'EUR',
    fee_amount: '0.09949005',
    fee_currency: 'ADA',
    description,
    metadata: {},
  }) as unknown as TransactionMappedData;

const FIRST = adaFill('trading ba495c89-0c50-4f80-845f-4654db18c598');
const SECOND = adaFill('trading 6adfb2e2-8591-4128-a7f7-c3a1d02a8b8b');

describe('resolveRowIdentity', () => {
  it('reads the identifier Bit2Me writes, which differs between the two identical fills', () => {
    expect(resolveRowIdentity(BIT2ME, FIRST)).toEqual({
      kind: 'DECLARED',
      value: 'trading ba495c89-0c50-4f80-845f-4654db18c598',
    });
    expect(resolveRowIdentity(BIT2ME, SECOND)).toEqual({
      kind: 'DECLARED',
      value: 'trading 6adfb2e2-8591-4128-a7f7-c3a1d02a8b8b',
    });
  });

  it('leaves a source that declares no identity column content-derived', () => {
    expect(resolveRowIdentity(KRAKEN, FIRST)).toEqual({ kind: 'CONTENT_DERIVED' });
    expect(resolveRowIdentity(GENERIC, FIRST)).toEqual({ kind: 'CONTENT_DERIVED' });
  });

  /** A declared column the row leaves blank states nothing, so it cannot stand in for identity. */
  it('falls back to content when the declared column is empty on this row', () => {
    expect(resolveRowIdentity(BIT2ME, { ...FIRST, description: '' })).toEqual({
      kind: 'CONTENT_DERIVED',
    });
  });
});

/**
 * The mirror defect, found by measuring rather than by a report. Bitunix's `Trx. ID` maps onto `tx_id`,
 * and `generateIdHash` preferred that field whenever it was populated — but `T0009` labels two
 * separate ADA deposits in the real export, twelve minutes and 538 ADA apart. The declaration has to
 * suppress the mapped value, not merely decline to read it.
 */
describe('a source whose id column is not per-row unique', () => {
  const BITUNIX = SOURCE_FORMAT_PROFILES['bitunix-spot'];

  const deposit = (timestamp: string, amount: string): TransactionMappedData =>
    ({
      timestamp,
      tx_type: 'DEPOSIT',
      asset_in: 'ADA',
      amount_in: amount,
      tx_id: 'T0009',
      metadata: {},
    }) as unknown as TransactionMappedData;

  const EARLIER = deposit('2025-12-13T12:07:06.000Z', '4.5');
  const LATER = deposit('2025-12-13T12:18:14.000Z', '543.344684');

  it('declares no identity, so its rows are told apart by content', () => {
    expect(resolveRowIdentity(BITUNIX, EARLIER)).toEqual({ kind: 'CONTENT_DERIVED' });
  });

  it('keeps two same-id deposits distinct once tx_id is suppressed', async () => {
    const hash = async (row: TransactionMappedData) =>
      generateIdHash({ ...row, tx_id: undefined });

    expect(await hash(EARLIER)).not.toBe(await hash(LATER));
  });

  it('would have merged them while the shared tx_id was read — 538 ADA lost', async () => {
    expect(await generateIdHash(EARLIER)).toBe(await generateIdHash(LATER));
  });
});

describe('the two identical ADA fills, once identity is declared', () => {
  it('hash differently, so the ledger holds both', async () => {
    const first = resolveRowIdentity(BIT2ME, FIRST);
    const second = resolveRowIdentity(BIT2ME, SECOND);
    if (first.kind !== 'DECLARED' || second.kind !== 'DECLARED') {
      throw new Error('the profile must declare Bit2Me row identity');
    }

    const hashOne = await generateIdHash({ ...FIRST, tx_id: first.value });
    const hashTwo = await generateIdHash({ ...SECOND, tx_id: second.value });
    expect(hashOne).not.toBe(hashTwo);
  });

  it('collide when identity comes from content alone — the defect this replaces', async () => {
    expect(await generateIdHash(FIRST)).toBe(await generateIdHash(SECOND));
  });

  it('is stable across re-imports of the same file, so re-ingesting stays idempotent', async () => {
    const identity = resolveRowIdentity(BIT2ME, FIRST);
    if (identity.kind !== 'DECLARED') throw new Error('expected a declared identity');
    const once = await generateIdHash({ ...FIRST, tx_id: identity.value });
    const twice = await generateIdHash({ ...FIRST, tx_id: identity.value });
    expect(once).toBe(twice);
  });
});
