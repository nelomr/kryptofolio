/**
 * Display ordering over non-monetary keys. The key types are deliberately narrow (an integer count,
 * an ISO date string) and the sort is stable, so equal keys keep the order the caller received.
 * Monetary ordering belongs to `Money.compareTo`, never here.
 */

export function orderByCountDescending<T>(items: readonly T[], countOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => countOf(b) - countOf(a));
}

export function orderByIsoDateDescending<T>(items: readonly T[], dateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const left = dateOf(a);
    const right = dateOf(b);
    return left < right ? 1 : left > right ? -1 : 0;
  });
}

/** Newest first; equal dates fall back to the key ascending, so the order never depends on how the rows arrived. Display only. */
export function orderByIsoDateDescendingThenKey<T>(
  items: readonly T[],
  dateOf: (item: T) => string,
  keyOf: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const left = dateOf(a);
    const right = dateOf(b);
    if (left !== right) return left < right ? 1 : -1;
    const leftKey = keyOf(a);
    const rightKey = keyOf(b);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
