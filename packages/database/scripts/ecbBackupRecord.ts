import {
  dailyExchangeRateSourceSchema,
  type DailyExchangeRateSource,
} from '@kryptofolio/shared-types';

export interface EcbBackupRow {
  readonly date: string;
  readonly pair: string;
  readonly rate: string;
  readonly source: DailyExchangeRateSource;
}

/**
 * A record either becomes a storable row or it does not; there is no half-valid row carrying a
 * reason alongside it, and no defaulted provenance standing in for one the file did not state.
 */
export type EcbBackupRecordOutcome =
  | { readonly kind: 'accepted'; readonly row: EcbBackupRow }
  | { readonly kind: 'rejected'; readonly reason: string };

/**
 * The backup CSV is an untrusted file, so its `source` column is validated here rather than copied.
 * Defaulting an absent or unrecognised value to `ECB` would let a rate nobody attributed claim to be
 * a published ECB fact, which is precisely what the write-precedence ordering rests on.
 */
export function classifyEcbBackupRecord(
  record: Readonly<Record<string, string | undefined>>,
): EcbBackupRecordOutcome {
  const date = record['date']?.trim() ?? '';
  const pair = record['pair']?.trim() ?? '';
  const rate = record['rate']?.trim() ?? '';
  const source = record['source']?.trim() ?? '';

  if (!date || !pair || !rate) {
    return { kind: 'rejected', reason: `incomplete row: date='${date}' pair='${pair}' rate='${rate}'` };
  }

  const parsedSource = dailyExchangeRateSourceSchema.safeParse(source);
  if (!parsedSource.success) {
    return { kind: 'rejected', reason: `unrecognised source: '${source}'` };
  }

  return { kind: 'accepted', row: { date, pair, rate, source: parsedSource.data } };
}
