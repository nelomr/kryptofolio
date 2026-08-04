import type { TransactionRow, ValidTransactionRow } from "@kryptofolio/shared-types";

import { normalizeTransactionDirection } from "../TransactionNormalizer";
import { aggregateRows } from "./rowAggregator";
import { applyProfileToRow } from "../sourceProfile/appliers";
import type { SourceFormatProfile } from "../sourceProfile/types";

/**
 * The two structural steps of ingestion, in the one order that works, as a single pure function.
 *
 * Direction is resolved first. `classifyCustodyMovement` decides a movement's fiscal meaning from the
 * asset it moves and the sign of the amount it moves, and aggregation redistributes that amount into
 * the directional fields and drops it. Run the other way round, the classifier is handed a record with
 * no sign left to read: it answers `UNCLASSIFIED` for exactly the case it exists to resolve, the raw
 * label survives, and whatever maps that label last ends up choosing a direction the domain refused
 * to determine.
 *
 * The profile is applied next, per leg, while each leg's own asset is still in scope: what an omitted
 * fee currency means, and whether a row wrote one movement onto both directional columns, are facts
 * about the source. The normalizer used to fill an omitted denomination itself, from the row's asset,
 * for every source alike — a global default that quietly answered for the two sources whose files mix
 * a fiat fee and an asset fee, and that the profile exists to replace.
 *
 * Aggregation last, over legs whose direction and denomination are established — which is also what
 * lets it tell a trade from a movement, because the distinction is which side each leg is on.
 *
 * Pure, and therefore callable from either side of the ingestion boundary. It runs on the backend, so
 * re-ingesting one file is deterministic in the server rather than dependent on the client version
 * that submitted it, and so the ledger receives both legs of a movement instead of one merged record.
 */
export function prepareIngestionRows(
  rows: readonly ValidTransactionRow[],
  profile: SourceFormatProfile,
): TransactionRow[] {
  const classified = rows.map((row) => ({
    ...row,
    mappedData: applyProfileToRow(profile, normalizeTransactionDirection(row.mappedData)),
  }));

  return aggregateRows(classified, profile);
}
