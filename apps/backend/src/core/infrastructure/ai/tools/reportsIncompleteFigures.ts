function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function flagsSet(holder: unknown): boolean {
  return isRecord(holder) && (holder.ratesIncomplete === true || holder.pricesIncomplete === true);
}

/**
 * Whether a real tool result tells the user that a total is partial. `portfolio_summary` nests the
 * two flags under `payload.metrics`, `kpis` carries them directly on `payload`; a truncated result
 * has no payload at all, so it never claims anything here.
 */
export function reportsIncompleteFigures(result: unknown): boolean {
  if (!isRecord(result) || result.kind !== 'ok') return false;
  const payload = result.payload;
  return flagsSet(payload) || (isRecord(payload) && flagsSet(payload.metrics));
}
