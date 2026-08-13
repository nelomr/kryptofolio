import { describe, it, expect } from 'vitest';
import { resolveRateBasis, type FxFigureKind, type FxRateBasis } from '../domain/models/FxRateBasis';

describe('resolveRateBasis', () => {
  it('converts a lot cost basis at its acquisition date', () => {
    expect(resolveRateBasis('COST_BASIS')).toEqual({ kind: 'ACQUISITION_DATE' });
  });

  it('converts a realized gain at its disposal date', () => {
    expect(resolveRateBasis('REALIZED_GAIN')).toEqual({ kind: 'DISPOSAL_DATE' });
  });

  it('converts a present-value figure at the latest available rate', () => {
    expect(resolveRateBasis('PRESENT_VALUE')).toEqual({ kind: 'LATEST' });
  });

  it("converts a series point at that point's own date", () => {
    expect(resolveRateBasis('SERIES_POINT')).toEqual({ kind: 'POINT_DATE' });
  });

  it('never resolves a historical figure to the latest rate', () => {
    const historical: readonly FxFigureKind[] = ['COST_BASIS', 'REALIZED_GAIN', 'SERIES_POINT'];
    for (const figure of historical) {
      expect(resolveRateBasis(figure).kind).not.toBe('LATEST');
    }
  });

  it('maps every figure kind to a distinct basis', () => {
    const figures: readonly FxFigureKind[] = [
      'COST_BASIS',
      'REALIZED_GAIN',
      'PRESENT_VALUE',
      'SERIES_POINT'
    ];
    const bases = figures.map((figure) => resolveRateBasis(figure).kind);
    expect(new Set(bases).size).toBe(figures.length);
  });

  it('returns a frozen basis so no caller can mutate the rule in place', () => {
    const basis: FxRateBasis = resolveRateBasis('COST_BASIS');
    expect(Object.isFrozen(basis)).toBe(true);
  });
});
