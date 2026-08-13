import type {
  EcbPublicationDay,
  IExchangeRatePort,
} from '../../domain/ports/IExchangeRatePort.js';
import type {
  DailyExchangeRate,
  IFxRateLedgerPort,
} from '../../domain/ports/IFxRateLedgerPort.js';
import { findMissingPublicationDates } from '../../domain/services/FxCoverage.js';
import { toUsdEurLedgerRate } from './FetchAndStoreExchangeRatesUC.js';

/** The only pair the ECB ledger stores; every figure in this project converts through it. */
const LEDGER_PAIR = 'USD/EUR';

export interface BackfillExchangeRateGapsInput {
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly from: string;
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly to: string;
}

export interface BackfillExchangeRateGapsResult {
  readonly rowsWritten: number;
  /** Publication dates the run closed, ascending. */
  readonly filledDates: readonly string[];
  /**
   * Publication dates still missing when the run ended, ascending.
   *
   * A run that reached only part of its gap set reports the remainder rather than the gap being
   * treated as closed: the figures depending on those dates stay unconvertible until a later run.
   */
  readonly unfilledDates: readonly string[];
}

/**
 * Every calendar date in a closed span, ascending.
 *
 * ISO-8601 dates of equal width compare identically as strings and as dates, and UTC arithmetic
 * keeps a daylight-saving transition from ever adding or dropping a day.
 */
export function enumerateCalendarDates(from: string, to: string): readonly string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * The ledger rows a gap set and a set of publication days produce.
 *
 * A publication day with no USD quote yields no row rather than a fabricated one — the pair is the
 * ledger's only content, and inventing it would put an unattributable rate behind a tax figure.
 */
export function planBackfillRows(
  gapDates: readonly string[],
  days: readonly EcbPublicationDay[],
): readonly DailyExchangeRate[] {
  const usdByDate = new Map(days.map((day) => [day.date, day.rates['USD']]));

  const rows: DailyExchangeRate[] = [];
  for (const date of gapDates) {
    const usd = usdByDate.get(date);
    if (usd === undefined) continue;
    rows.push({ date, pair: LEDGER_PAIR, rate: toUsdEurLedgerRate(usd), source: 'ECB' });
  }
  return rows;
}

/**
 * Fills exactly the dates the ECB published on and the ledger lacks.
 *
 * The Functional Sandwich: read the stored dates through the ledger port, fetch the ECB's own
 * record of when it published, compute the gap set and its rows purely, write them back through
 * the port. No date the ECB did not publish on is ever requested, so the ECB's 134 holidays are
 * not refetched forever.
 */
export class BackfillExchangeRateGapsUC {
  private readonly exchangeRatePort: IExchangeRatePort;
  private readonly fxRateLedgerPort: IFxRateLedgerPort;

  constructor(exchangeRatePort: IExchangeRatePort, fxRateLedgerPort: IFxRateLedgerPort) {
    this.exchangeRatePort = exchangeRatePort;
    this.fxRateLedgerPort = fxRateLedgerPort;
  }

  async execute(
    input: BackfillExchangeRateGapsInput,
  ): Promise<BackfillExchangeRateGapsResult> {
    const stored = new Set(
      await this.fxRateLedgerPort.getStoredRateDates({
        pair: LEDGER_PAIR,
        from: input.from,
        to: input.to,
      }),
    );

    // The gap set proper needs the ECB's publication dates, which only the document holds. But a
    // date the ledger already holds cannot be in it, so the oldest calendar date it lacks is a
    // sound lower bound — and where the ledger lacks none, the gap set is empty without asking.
    const candidates = enumerateCalendarDates(input.from, input.to).filter(
      (date) => !stored.has(date),
    );
    const oldestCandidate = candidates[0];
    if (oldestCandidate === undefined) {
      return { rowsWritten: 0, filledDates: [], unfilledDates: [] };
    }

    const history = await this.exchangeRatePort.getHistoricalRates(oldestCandidate);

    const gapDates = findMissingPublicationDates({
      publicationDates: history.days.map((day) => day.date),
      storedDates: [...stored],
      from: input.from,
      to: input.to,
    });

    const rows = planBackfillRows(gapDates, history.days);
    const filled = new Set(rows.map((row) => row.date));

    const rowsWritten =
      rows.length === 0 ? 0 : await this.fxRateLedgerPort.upsertDailyExchangeRates(rows);

    return {
      rowsWritten,
      filledDates: [...filled].sort(),
      unfilledDates: gapDates.filter((date) => !filled.has(date)),
    };
  }
}
