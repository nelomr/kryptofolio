export function downsampleSeries<T>(
  series: readonly T[],
  maxPoints: number,
): {
  sampled: readonly T[];
  omittedCount: number;
} {
  if (series.length <= maxPoints) {
    return { sampled: series, omittedCount: 0 };
  }

  const stride = series.length / maxPoints;
  const sampled: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(series[Math.floor(i * stride)] as T);
  }

  return { sampled, omittedCount: series.length - sampled.length };
}
