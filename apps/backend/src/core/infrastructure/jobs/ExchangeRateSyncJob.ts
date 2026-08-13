import { container } from '../di/container.js';
import { bffLogger } from '../../utils/logger.js';
import type { FxBackfillRequest } from '../../domain/ports/IBackfillSchedulerPort.js';
import type { IFxRateLedgerPort } from '../../domain/ports/IFxRateLedgerPort.js';
import type { BackfillExchangeRateGapsResult } from '../../application/use-cases/BackfillExchangeRateGapsUC.js';

let exchangeRateInterval: NodeJS.Timeout | null = null;

const LEDGER_PAIR = 'USD/EUR';

/** The ECB's first publication day. Nothing earlier exists to fetch. */
const ECB_FIRST_PUBLICATION_DATE = '1999-01-04';

interface BootBackfillRunner {
  execute(request: FxBackfillRequest): Promise<BackfillExchangeRateGapsResult>;
}

/**
 * Closes whatever span the ledger lost while the process was down.
 *
 * The span is the ledger's own newest row through today, whatever its width — a boot after two
 * years off must fill those two years, not only the recent weeks. Which document that costs is the
 * provider's decision, made against what the fetched document actually contains; capping the span
 * here would cap coverage, which is exactly what the request forbids.
 *
 * Runs before the daily fetch, because that fetch carries the latest rate forward to today and
 * would otherwise leave the ledger looking fully covered for every date it never published on.
 */
export async function repairFxCoverageOnBoot(
  fxRateLedgerPort: IFxRateLedgerPort,
  runner: BootBackfillRunner,
  today: string,
): Promise<BackfillExchangeRateGapsResult> {
  const newest = await fxRateLedgerPort.getRateAsOf(LEDGER_PAIR, today);
  const from = newest?.date ?? ECB_FIRST_PUBLICATION_DATE;

  return runner.execute({ from, to: today });
}

export async function startExchangeRateBootSync() {
  try {
    const { FetchAndStoreExchangeRatesUC } = await import('../../application/use-cases/FetchAndStoreExchangeRatesUC.js');
    const useCase = new FetchAndStoreExchangeRatesUC(
      container.userSettingsPort,
      container.exchangeRatePort,
      container.fxRateLedgerPort
    );
    
    const previousDate = await container.userSettingsPort.getSetting('exchange_rate_date');

    try {
      const repair = await repairFxCoverageOnBoot(
        container.fxRateLedgerPort,
        container.backfillExchangeRateGapsUC,
        new Date().toISOString().slice(0, 10),
      );
      bffLogger.info(
        { filled: repair.filledDates.length, unfilled: repair.unfilledDates.length },
        'FX coverage repaired on boot',
      );
      if (repair.rowsWritten > 0) {
        await container.fifoMaterializerService.recalculate(true);
      }
    } catch (err) {
      bffLogger.error({ err }, 'Boot FX coverage repair failed; the daily sync continues');
    }

    const newDate = await useCase.execute();
    
    if (previousDate === newDate) {
      if (!exchangeRateInterval) {
        bffLogger.info(`ECB rate date (${newDate}) unchanged since last boot. Starting 1h polling interval.`);
        exchangeRateInterval = setInterval(async () => {
          try {
            const polledDate = await useCase.execute();
            if (polledDate !== previousDate) {
              bffLogger.info(`New ECB exchange rate received (${polledDate}). Stopping polling interval.`);
              if (exchangeRateInterval) {
                clearInterval(exchangeRateInterval);
                exchangeRateInterval = null;
              }
            }
          } catch (err) {
            bffLogger.error({ err }, 'Error polling exchange rates');
          }
        }, 60 * 60 * 1000); // 1 hour
      }
    } else {
      bffLogger.info(`ECB exchange rates synced on boot for date: ${newDate}`);
      if (exchangeRateInterval) {
        clearInterval(exchangeRateInterval);
        exchangeRateInterval = null;
      }
    }
  } catch (err) {
    bffLogger.error({ err }, 'Failed to execute Boot Sync for exchange rates');
  }
}
