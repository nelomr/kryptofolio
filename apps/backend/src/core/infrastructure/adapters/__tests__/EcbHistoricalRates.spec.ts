import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EcbExchangeRateAdapter,
  parseEcbHistoricalDocument,
} from '../EcbExchangeRateAdapter.js';

const sliceXml = readFileSync(
  fileURLToPath(new URL('./fixtures/eurofxref-hist-slice.xml', import.meta.url)),
  'utf8',
);

/** The dates the fixture was sliced from the real 8 MB archive, in the order the real file has them. */
const FIXTURE_DATES = [
  '2026-08-11',
  '2026-08-10',
  '2025-04-24',
  '2025-04-23',
  '2025-04-22',
  '2025-04-17',
  '2025-04-16',
  '1999-01-06',
  '1999-01-05',
  '1999-01-04',
] as const;

const FIXTURE_OLDEST = '1999-01-04';

describe('parseEcbHistoricalDocument', () => {
  it('parses every publication date, not only the newest one', () => {
    const days = parseEcbHistoricalDocument(sliceXml, FIXTURE_OLDEST);

    expect(days).toHaveLength(FIXTURE_DATES.length);
    expect(days.map((d) => d.date)).toEqual([...FIXTURE_DATES]);
  });

  it('keeps the document order, newest first, as the real file has it', () => {
    const days = parseEcbHistoricalDocument(sliceXml, FIXTURE_OLDEST);
    const dates = days.map((d) => d.date);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('spans the unpublished weekdays Good Friday and Easter Monday 2025', () => {
    const dates = parseEcbHistoricalDocument(sliceXml, FIXTURE_OLDEST).map((d) => d.date);

    expect(dates).toContain('2025-04-17');
    expect(dates).toContain('2025-04-22');
    expect(dates).not.toContain('2025-04-18');
    expect(dates).not.toContain('2025-04-21');
  });

  it('reaches the ECB first publication day', () => {
    const days = parseEcbHistoricalDocument(sliceXml, FIXTURE_OLDEST);

    expect(days.at(-1)?.date).toBe('1999-01-04');
  });

  it('parses rates of any decimal width', () => {
    const days = parseEcbHistoricalDocument(sliceXml, FIXTURE_OLDEST);
    const usd = new Map(days.map((d) => [d.date, d.rates['USD']]));

    expect(usd.get('2026-08-11')).toBe('1.154');
    expect(usd.get('2025-04-17')).toBe('1.136');
    expect(usd.get('1999-01-05')).toBe('1.179');
    expect(usd.get('2026-08-10')).toBe('1.1555');
  });

  it('stops reading once the cursor passes the oldest date needed', () => {
    const days = parseEcbHistoricalDocument(sliceXml, '2025-04-22');

    expect(days.map((d) => d.date)).toEqual([
      '2026-08-11',
      '2026-08-10',
      '2025-04-24',
      '2025-04-23',
      '2025-04-22',
    ]);
  });

  it('rejects a malformed document outright rather than yielding a partial date set', () => {
    const truncated = sliceXml.slice(0, sliceXml.indexOf('2025-04-24') + 40);

    expect(() => parseEcbHistoricalDocument(truncated, FIXTURE_OLDEST)).toThrow(
      /ECB historical/i,
    );
  });

  it('rejects a document whose rate attribute is not a decimal string', () => {
    const corrupted = sliceXml.replace('rate="1.154"', 'rate="not-a-rate"');

    expect(() => parseEcbHistoricalDocument(corrupted, FIXTURE_OLDEST)).toThrow(
      /ECB historical/i,
    );
  });
});

interface FetchCall {
  readonly url: string;
}

function stubFetcher(documents: Readonly<Record<string, string>>, calls: FetchCall[]) {
  return async (url: string) => {
    calls.push({ url });
    const body = documents[url];
    if (body === undefined) {
      return { ok: false, statusText: 'Not Found', text: async () => '' };
    }
    return { ok: true, statusText: 'OK', text: async () => body };
  };
}

/** Only the two most recent fixture dates, standing in for the 68 KB bounded document. */
const boundedXml = (() => {
  const cut = sliceXml.indexOf('<Cube time="2025-04-24"');
  return `${sliceXml.slice(0, cut)}</Cube></gesmes:Envelope>`;
})();

function makeAdapter(calls: FetchCall[]) {
  return new EcbExchangeRateAdapter(
    stubFetcher(
      {
        [EcbExchangeRateAdapter.BOUNDED_HISTORY_URL]: boundedXml,
        [EcbExchangeRateAdapter.FULL_HISTORY_URL]: sliceXml,
      },
      calls,
    ),
  );
}

describe('EcbExchangeRateAdapter.getHistoricalRates document selection', () => {
  it('escalates to the full archive when the oldest date needed predates the bounded document', async () => {
    const calls: FetchCall[] = [];
    const result = await makeAdapter(calls).getHistoricalRates('1999-01-04');

    expect(calls.map((c) => c.url)).toContain(EcbExchangeRateAdapter.FULL_HISTORY_URL);
    expect(result.kind).toBe('COVERS_REQUEST');
    expect(result.days.map((d) => d.date)).toContain('1999-01-04');
  });

  it('does not download the full archive when the whole gap fits the bounded document', async () => {
    const calls: FetchCall[] = [];
    const result = await makeAdapter(calls).getHistoricalRates('2026-08-10');

    expect(calls.map((c) => c.url)).toEqual([EcbExchangeRateAdapter.BOUNDED_HISTORY_URL]);
    expect(result.document).toBe('BOUNDED_RECENT');
    expect(result.kind).toBe('COVERS_REQUEST');
  });

  it('decides from the oldest date the fetched document actually contains, not an assumed window', async () => {
    const calls: FetchCall[] = [];
    // Inside a 90-day window from the fixture's newest date, yet outside the stub bounded document.
    const result = await makeAdapter(calls).getHistoricalRates('2026-08-01');

    expect(calls.map((c) => c.url)).toEqual([
      EcbExchangeRateAdapter.BOUNDED_HISTORY_URL,
      EcbExchangeRateAdapter.FULL_HISTORY_URL,
    ]);
    expect(result.document).toBe('FULL_ARCHIVE');
  });

  it('reports itself short of the request rather than claiming the gap closed', async () => {
    const calls: FetchCall[] = [];
    const result = await makeAdapter(calls).getHistoricalRates('1998-01-01');

    expect(result.kind).toBe('SHORT_OF_REQUEST');
    if (result.kind !== 'SHORT_OF_REQUEST') throw new Error('unreachable');
    expect(result.oldestAvailableDate).toBe('1999-01-04');
  });
});
