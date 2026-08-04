import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

import { DatabaseSync } from 'node:sqlite';

/**
 * The three payloads below are verbatim production rows: they are what the ledger's non-negative
 * fiat CHECK rejected, and the ones carrying a negative `total_fiat` are the case that produced
 * negative-cost lots and phantom capital gains.
 */
describe('Constraint Repro', () => {
  const ACCOUNT = '10000000-0000-0000-0000-000000000007';

  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;
  let uc: CsvIngestionUseCase;

  const priceProvider: IPriceProviderPort = {
    getHistoricalPrice: async () => toPreciseAmount('1'),
  };

  const userSettings: IUserSettingsPort = {
    getSetting: async () => null,
    setSetting: async () => {},
  };

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    adapter = new SQLiteLedgerAdapter(db);
    await adapter.initialize();
    uc = new CsvIngestionUseCase(adapter, priceProvider, userSettings);
    await adapter.ensureAccountExists({ accountId: ACCOUNT, name: 'TestAccount' });
  });

  afterEach(() => {
    db.close();
  });

  async function persistedFiat(): Promise<{ total: string; price: string }[]> {
    const saved = await adapter.getSpotTransactions(ACCOUNT);
    return saved.map((tx) => ({ total: tx.total_fiat.toString(), price: tx.price_fiat.toString() }));
  }

  it('Payload 1 - WITHDRAWAL', async () => {
    const payload: IngestibleTransaction = {
      tx_id: '5a68d802-7105-46d9-b314-8fd5fbd731f8', timezone: 'Europe/Madrid', tx_type: 'WITHDRAWAL',
      account_id: ACCOUNT,
      amount_out: '-439.55', asset_out: 'XRP', destination_address: 'rp...',
      fee_amount: '0', fee_currency: 'XRP', fiat_currency: '',
      id_hash: '066be5ebe8317b81177f0a8530bccf6e2b9d7b2ae609cb54fa7307747e198c19',
      metadata: { time: '10:19:39' }, price_fiat: '', quote_currency: '', status: 'Completed',
      timestamp: '2026-02-07T00:00:00Z', total_fiat: '',
    };

    const result = await uc.execute([payload], 'spot', 'generic', 'UTC');

    expect(result.persisted).toBe(1);
    expect(await persistedFiat()).toEqual([{ total: '439.55', price: '1' }]);
  });

  it('Payload 2 - DEPOSIT', async () => {
    const payload: IngestibleTransaction = {
      tx_id: '7a466c8e-4e56-4e4c-9f29-0c0c34a68003', tx_type: 'DEPOSIT',
      account_id: ACCOUNT,
      amount_in: '500', asset_in: 'EUR', destination_address: 'ES...',
      fee_amount: '0', fee_currency: 'EUR', fiat_currency: '',
      id_hash: 'e127becc2373efa4931c7e167f63a1dd3c479fc70d20552368b7087d51264a83',
      metadata: { time: '22:42:54' }, price_fiat: '', quote_currency: '', status: 'Completed',
      timestamp: '2026-02-05T00:00:00Z', total_fiat: '', timezone: 'Europe/Madrid',
    };

    const result = await uc.execute([payload], 'spot', 'generic', 'UTC');

    expect(result.persisted).toBe(1);
    expect(await persistedFiat()).toEqual([{ total: '500', price: '1' }]);
  });

  it('Payload 3 - BUY', async () => {
    const payload: IngestibleTransaction = {
      tx_id: 'a00b3738-8d5e-4cee-b074-33a3d074ff77', tx_type: 'BUY',
      account_id: ACCOUNT,
      amount_in: '0.30338', asset_in: 'ETH', destination_address: '',
      fee_amount: '0.7499', fee_currency: 'EUR', fiat_currency: 'EUR',
      id_hash: '5b48d6229b2e9ad19c5cdedbc396830831c000b9b63511f64c809525be369c3a',
      metadata: { time: '16:29:01.408' }, price_fiat: '1645', quote_currency: 'EUR', status: 'Completed',
      timestamp: '2026-02-05T00:00:00Z', total_fiat: '-499.81', timezone: 'Europe/Madrid',
    };

    const result = await uc.execute([payload], 'spot', 'generic', 'UTC');

    expect(result.persisted).toBe(1);
    expect(await persistedFiat()).toEqual([{ total: '499.81', price: '1645' }]);
  });
});
