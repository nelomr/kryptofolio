import { z } from 'zod';

/**
 * The sources whose export format has been measured, plus the fallback for everything else.
 *
 * Only the identifier lives in this package. The profile table and the functions that apply it need
 * no place in the leaf: nothing in `packages/database` reads a profile, because a row is already
 * normalised by the time DuckDB sees it. What crosses the wire is this string, so this is the one
 * part every consumer — the wizard, the ingestion route's Zod schema, and the use case — must share.
 *
 * `generic` is a member rather than an absence. A file nobody has profiled is still ingestible, and
 * an identifier that names the uncertainty is what lets the pipeline report a convention as
 * undetermined instead of assuming one.
 */
export const SOURCE_PROFILE_IDS = [
  'kraken-spot',
  'kraken-futures',
  'bit2me-spot',
  'bitvavo-spot',
  'bitunix-spot',
  'tangem',
  'generic',
] as const;

export type SourceProfileId = (typeof SOURCE_PROFILE_IDS)[number];

export const sourceProfileIdSchema = z.enum(SOURCE_PROFILE_IDS);

export function isSourceProfileId(value: unknown): value is SourceProfileId {
  return typeof value === 'string' && (SOURCE_PROFILE_IDS as readonly string[]).includes(value);
}
