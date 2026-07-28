/**
 * Generates an infinite, deterministic hex color for an asset based on index or symbol string hash.
 * Uses the Golden Ratio Angle (~137.508°) for optimal, vibrant, non-repeating spectrum distribution.
 *
 * @param symbolOrIndex Asset ticker symbol (e.g. 'BTC') or integer index.
 * @param indexHint Optional numeric index fallback when symbol is not provided.
 */
export function generateAssetColor(symbolOrIndex?: string | number, indexHint = 0): string {
  let seed = indexHint;
  if (typeof symbolOrIndex === 'string' && symbolOrIndex.length > 0) {
    let hash = 0;
    for (let i = 0; i < symbolOrIndex.length; i++) {
      hash = symbolOrIndex.charCodeAt(i) + ((hash << 5) - hash);
    }
    seed = Math.abs(hash);
  } else if (typeof symbolOrIndex === 'number') {
    seed = symbolOrIndex;
  }

  const hue = (seed * 137.507764) % 360;
  const saturation = 72;
  const lightness = 56;

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
