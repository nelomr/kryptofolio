import type {
  EcbPublicationDay,
  HistoricalRatesResult,
  IExchangeRatePort,
} from "../../domain/ports/IExchangeRatePort.js";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const EcbCubeSchema = z.object({
  "@_currency": z.string(),
  "@_rate": z.string(),
});

const EcbTimeCubeSchema = z.object({
  "@_time": z.string(),
  Cube: z.array(EcbCubeSchema),
});

/**
 * The historical documents' own schema, deliberately separate from the daily one above.
 *
 * The daily document holds exactly one time cube; the historical ones hold thousands, and the
 * expression that reads the daily shape (`rootCube[0].Cube[0]`) silently returns only the newest
 * of them. Sharing a schema is what would let that truncation pass validation.
 */
const EcbHistoricalRateSchema = z.object({
  "@_currency": z.string().min(1),
  // Never a fixed decimal width: 691 of the archive's 7.068 USD quotes are not 4dp.
  "@_rate": z.string().regex(/^\d+(\.\d+)?$/),
});

const EcbHistoricalDaySchema = z.object({
  "@_time": z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  Cube: z.array(EcbHistoricalRateSchema).min(1),
});

const EcbHistoricalDocumentSchema = z.object({
  "gesmes:Envelope": z.object({
    Cube: z
      .array(z.object({ Cube: z.array(EcbHistoricalDaySchema).min(1) }))
      .min(1),
  }),
});

const DAY_CUBE_PATTERN = /<Cube\s+time="(\d{4}-\d{2}-\d{2})"/g;

function historicalParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "Cube" || name === "Cube[]",
  });
}

/**
 * Every publication day in the document, newest first, down to `oldestDateNeeded`.
 *
 * `fast-xml-parser` has no streaming mode and the full archive costs ~108 MB of heap to parse
 * whole, so the descending document order is exploited by cutting the text at the first day older
 * than the request before any parsing happens. The cut lands between two self-contained day cubes,
 * so closing the two open elements is all it takes to leave well-formed XML.
 *
 * Throws rather than returning what it managed to read: a partial date set is indistinguishable
 * from a genuinely short archive, and the caller would record the gap as closed.
 */
export function parseEcbHistoricalDocument(
  xml: string,
  oldestDateNeeded: string,
): readonly EcbPublicationDay[] {
  DAY_CUBE_PATTERN.lastIndex = 0;
  let cutIndex: number | null = null;
  for (const match of xml.matchAll(DAY_CUBE_PATTERN)) {
    if (match[1]! < oldestDateNeeded) {
      cutIndex = match.index;
      break;
    }
  }

  const trimmed =
    cutIndex === null
      ? xml
      : `${xml.slice(0, cutIndex)}</Cube></gesmes:Envelope>`;

  let parsed: unknown;
  try {
    parsed = historicalParser().parse(trimmed);
  } catch (err) {
    throw new Error(
      `Invalid ECB historical document: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const validated = EcbHistoricalDocumentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Invalid ECB historical document: ${validated.error.issues[0]?.message ?? "unrecognised structure"}`,
    );
  }

  const days: EcbPublicationDay[] = [];
  for (const root of validated.data["gesmes:Envelope"].Cube) {
    for (const day of root.Cube) {
      const rates: Record<string, string> = {};
      for (const quote of day.Cube) {
        rates[quote["@_currency"]] = quote["@_rate"];
      }
      days.push({ date: day["@_time"], rates });
    }
  }

  return days;
}

/** The subset of `fetch` this adapter uses, so a test can supply a document without a network. */
export type EcbFetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly statusText: string;
  text(): Promise<string>;
}>;

export class EcbExchangeRateAdapter implements IExchangeRatePort {
  static readonly DAILY_URL =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
  static readonly BOUNDED_HISTORY_URL =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
  static readonly FULL_HISTORY_URL =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

  private readonly url = EcbExchangeRateAdapter.DAILY_URL;
  private readonly fetchImpl: EcbFetch;

  constructor(fetchImpl: EcbFetch = (url) => fetch(url)) {
    this.fetchImpl = fetchImpl;
  }

  async getLatestRates(): Promise<{
    date: string;
    rates: Record<string, string>;
  }> {
    const response = await this.fetchImpl(this.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ECB rates: ${response.statusText}`);
    }

    const xml = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name) => {
        if (name === "Cube" || name === "Cube[]") return true;
        return false;
      },
    });

    const parsed = parser.parse(xml);

    try {
      const rootCube = parsed["gesmes:Envelope"]["Cube"];
      const timeCube =
        rootCube[0]?.Cube?.[0] ||
        rootCube[0]?.Cube ||
        rootCube?.Cube?.[0] ||
        rootCube?.Cube;

      const validated = EcbTimeCubeSchema.parse(timeCube);

      const date = validated["@_time"];
      const rates: Record<string, string> = {};

      for (const cube of validated.Cube) {
        rates[cube["@_currency"]] = cube["@_rate"];
      }

      if (!rates["USD"]) {
        throw new Error("USD rate not found in parsed ECB XML");
      }

      return {
        date,
        rates,
      };
    } catch (err) {
      console.error(
        "[EcbExchangeRateAdapter] Failed to parse XML structure",
        err,
      );
      throw new Error("Invalid ECB XML structure");
    }
  }

  async getHistoricalRates(
    oldestDateNeeded: string,
  ): Promise<HistoricalRatesResult> {
    const boundedXml = await this.fetchDocument(
      EcbExchangeRateAdapter.BOUNDED_HISTORY_URL,
    );

    // Measured against what arrived, never against an assumed window width: the bounded document's
    // span is the ECB's to change, and assuming 90 days is what would cap coverage silently.
    if (documentReachesBack(boundedXml, oldestDateNeeded)) {
      return {
        kind: "COVERS_REQUEST",
        document: "BOUNDED_RECENT",
        days: parseEcbHistoricalDocument(boundedXml, oldestDateNeeded),
      };
    }

    const fullXml = await this.fetchDocument(
      EcbExchangeRateAdapter.FULL_HISTORY_URL,
    );
    const full = parseEcbHistoricalDocument(fullXml, oldestDateNeeded);

    if (documentReachesBack(fullXml, oldestDateNeeded)) {
      return { kind: "COVERS_REQUEST", document: "FULL_ARCHIVE", days: full };
    }

    const oldestAvailableDate = full.at(-1)?.date;
    if (oldestAvailableDate === undefined) {
      throw new Error("ECB historical archive contained no publication dates");
    }

    return {
      kind: "SHORT_OF_REQUEST",
      document: "FULL_ARCHIVE",
      days: full,
      oldestAvailableDate,
    };
  }

  private async fetchDocument(url: string): Promise<string> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ECB history from ${url}: ${response.statusText}`,
      );
    }
    return response.text();
  }
}

/**
 * Whether the document itself holds a publication on or before the date requested.
 *
 * Read off the raw text rather than the parsed days, because the parse deliberately stops at the
 * request's lower bound: the parsed set's oldest entry is the request's boundary, not the
 * document's, and comparing against it would escalate to the 8 MB archive on every short gap.
 */
function documentReachesBack(xml: string, oldestDateNeeded: string): boolean {
  DAY_CUBE_PATTERN.lastIndex = 0;
  for (const match of xml.matchAll(DAY_CUBE_PATTERN)) {
    if (match[1]! <= oldestDateNeeded) return true;
  }
  return false;
}
