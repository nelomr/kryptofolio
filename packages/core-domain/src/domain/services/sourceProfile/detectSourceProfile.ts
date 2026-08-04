import type { SourceProfileId } from "@kryptofolio/shared-types";

import { SOURCE_FORMAT_PROFILES } from "./profiles";

/**
 * What the headers alone establish. Never a pick among equals.
 *
 * The registry this replaces documented its own defect: *"Order matters for detect() — parsers are
 * checked in sequence"*. An outcome that depends on array position is correct until someone reorders
 * the list and silent when they do, so every candidate is evaluated and a tie is reported as one.
 */
export type SourceProfileDetection =
  | { readonly kind: "RESOLVED"; readonly profileId: SourceProfileId }
  /** Sorted, so a report is stable — the order is presentational and decides nothing. */
  | { readonly kind: "AMBIGUOUS"; readonly candidates: readonly SourceProfileId[] }
  | { readonly kind: "UNRECOGNISED" };

/** Exporters change capitalisation and pad cells; neither changes which source wrote the file. */
function normalise(header: string): string {
  return header.trim().toLowerCase();
}

/**
 * Resolves a profile from a header row, or reports why it could not.
 *
 * Detection is a suggestion, not a decision: the identifier is a required field on the ingestion
 * contract and the user confirms it, so a misdetection degrades into a wrong default in a selector
 * rather than into wrongly interpreted data.
 */
export function detectSourceProfile(headers: readonly string[]): SourceProfileDetection {
  const present = new Set(headers.map(normalise));

  const candidates = Object.values(SOURCE_FORMAT_PROFILES)
    .filter((profile) => {
      // The fallback is reached by the absence of a match; a signature matching everything would
      // make every file ambiguous.
      if (profile.signature.kind !== "HEADER_SET") return false;
      const { required, forbidden } = profile.signature;
      if (required.length === 0) return false;
      if (!required.every((header) => present.has(normalise(header)))) return false;
      return !forbidden.some((header) => present.has(normalise(header)));
    })
    .map((profile) => profile.id)
    .sort();

  if (candidates.length === 1) return { kind: "RESOLVED", profileId: candidates[0] };
  if (candidates.length > 1) return { kind: "AMBIGUOUS", candidates };
  return { kind: "UNRECOGNISED" };
}
