import { container } from '../di/container.js';
import { bffLogger } from '../../utils/logger.js';

let exchangeRateInterval: NodeJS.Timeout | null = null;

export async function startExchangeRateBootSync() {
  try {
    const { FetchAndStoreExchangeRatesUC } = await import('../../application/use-cases/FetchAndStoreExchangeRatesUC.js');
    const useCase = new FetchAndStoreExchangeRatesUC(
      container.userSettingsPort,
      container.exchangeRatePort,
      container.fxRateLedgerPort
    );
    
    const previousDate = await container.userSettingsPort.getSetting('exchange_rate_date');
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
