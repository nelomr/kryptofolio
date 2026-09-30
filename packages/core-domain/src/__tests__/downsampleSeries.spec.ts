import { describe, it, expect } from "vitest";
import { downsampleSeries } from "../domain/services/downsampleSeries";

describe("downsampleSeries", () => {
  it("downsamples a 365-point series to at most 120 points via even positional stride, with a correct omittedCount", () => {
    const series = Array.from({ length: 365 }, (_, i) => ({ index: i }));

    const { sampled, omittedCount } = downsampleSeries(series, 120);

    expect(sampled.length).toBeLessThanOrEqual(120);
    expect(omittedCount).toBe(series.length - sampled.length);
  });

  it("returns a series at or under maxPoints unchanged with omittedCount 0", () => {
    const series = Array.from({ length: 50 }, (_, i) => ({ index: i }));

    const { sampled, omittedCount } = downsampleSeries(series, 120);

    expect(sampled).toEqual(series);
    expect(omittedCount).toBe(0);
  });

  it("selects points by position only — never reads a numeric field of any point", () => {
    // Markers sort in the exact reverse of index order, so any value-based selection
    // would pick a different set/order than pure positional stride does.
    const markers = ["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"];
    const series = markers.map((marker) => ({ marker }));

    const { sampled, omittedCount } = downsampleSeries(series, 4);

    expect(omittedCount).toBe(series.length - sampled.length);
    // Positional stride over 10 items to 4 points picks indices 0, 2, 5, 7.
    expect(sampled).toEqual([series[0], series[2], series[5], series[7]]);
  });
});
