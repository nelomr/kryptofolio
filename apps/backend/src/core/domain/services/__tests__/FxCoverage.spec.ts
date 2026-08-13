import { describe, it, expect } from 'vitest';
import { findMissingPublicationDates } from '../FxCoverage.js';

/**
 * A slice of the ECB's own record of when it published, taken from `eurofxref-hist.xml`.
 *
 * 2025-04-18 (Good Friday) and 2025-04-21 (Easter Monday) are absent, as are both weekends. They are
 * absent because the real document does not contain them — not because a rule here excluded them.
 * Easter moves with the lunar calendar, so no weekday-plus-holiday-table rule reproduces this list.
 */
const ECB_PUBLICATION_DATES = [
  '2025-04-14',
  '2025-04-15',
  '2025-04-16',
  '2025-04-17',
  '2025-04-22',
  '2025-04-23',
  '2025-04-24',
  '2025-04-25',
  '2025-04-28',
] as const;

describe('findMissingPublicationDates', () => {
  it('does not report a weekend the ECB never published on', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: ECB_PUBLICATION_DATES,
      from: '2025-04-14',
      to: '2025-04-28',
    });

    expect(missing).toEqual([]);
    expect(missing).not.toContain('2025-04-19');
    expect(missing).not.toContain('2025-04-20');
  });

  it('does not report an ECB holiday falling on a weekday', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: ECB_PUBLICATION_DATES.filter((d) => d !== '2025-04-22'),
      from: '2025-04-14',
      to: '2025-04-28',
    });

    // Good Friday and Easter Monday are weekdays; only the genuinely uncovered publication date is a gap.
    expect(missing).toEqual(['2025-04-22']);
  });

  it('finds an interior hole exactly, and nothing either side of it', () => {
    const hole = ['2025-04-16', '2025-04-17', '2025-04-22'];
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: ECB_PUBLICATION_DATES.filter((d) => !hole.includes(d)),
      from: '2025-04-14',
      to: '2025-04-28',
    });

    expect(missing).toEqual(hole);
  });

  it('finds a gap earlier than every stored row, unbounded by MIN(date)', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: ['2025-04-23', '2025-04-24', '2025-04-25', '2025-04-28'],
      from: '2025-04-14',
      to: '2025-04-28',
    });

    expect(missing).toEqual([
      '2025-04-14',
      '2025-04-15',
      '2025-04-16',
      '2025-04-17',
      '2025-04-22',
    ]);
  });

  it('reports nothing when every publication date in range is held', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: [...ECB_PUBLICATION_DATES, '2025-05-02'],
      from: '2025-04-14',
      to: '2025-04-28',
    });

    expect(missing).toEqual([]);
  });

  it('ignores publication dates outside the requested range at both ends', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ECB_PUBLICATION_DATES,
      storedDates: [],
      from: '2025-04-16',
      to: '2025-04-23',
    });

    expect(missing).toEqual(['2025-04-16', '2025-04-17', '2025-04-22', '2025-04-23']);
  });

  it('returns ascending dates from a descending document, which is how the ECB orders it', () => {
    const missing = findMissingPublicationDates({
      publicationDates: [...ECB_PUBLICATION_DATES].reverse(),
      storedDates: [],
      from: '2025-04-22',
      to: '2025-04-28',
    });

    expect(missing).toEqual(['2025-04-22', '2025-04-23', '2025-04-24', '2025-04-25', '2025-04-28']);
  });

  it('reports a duplicated publication date once', () => {
    const missing = findMissingPublicationDates({
      publicationDates: ['2025-04-22', '2025-04-22'],
      storedDates: [],
      from: '2025-04-14',
      to: '2025-04-28',
    });

    expect(missing).toEqual(['2025-04-22']);
  });
});
