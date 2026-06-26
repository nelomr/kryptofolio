import { describe, it, expect, beforeEach } from 'vitest';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';
import { CsvIngestionUseCase } from '../CsvIngestionUseCase';
import Decimal from 'decimal.js';

import { DatabaseSync } from 'node:sqlite';

describe('Constraint Repro', () => {
  let adapter: SQLiteLedgerAdapter;
  let uc: CsvIngestionUseCase;

  beforeEach(() => {
    const db = new DatabaseSync(':memory:');
    adapter = new SQLiteLedgerAdapter(db);
    adapter.initialize();
    
    const mockPriceProvider = {
      getHistoricalPrice: async () => new Decimal(1),
      getCurrentPrice: async () => new Decimal(1)
    };
    
    uc = new CsvIngestionUseCase(adapter, mockPriceProvider as any);
  });

  it('Payload 1 - WITHDRAWAL', async () => {
    await adapter.ensureAccountExists("10000000-0000-0000-0000-000000000007", "TestAccount");
    const payload1 = {
      tx_id: "5a68d802-7105-46d9-b314-8fd5fbd731f8", timezone: "Europe/Madrid", tx_type: "WITHDRAWAL",
      account_id: "10000000-0000-0000-0000-000000000007",
      amount_out: "-439.55", asset_out: "XRP", destination_address: "rp...",
      fee_amount: "0", fee_currency: "XRP", fiat_currency: "",
      id_hash: "066be5ebe8317b81177f0a8530bccf6e2b9d7b2ae609cb54fa7307747e198c19",
      metadata: {time: "10:19:39"}, price_fiat: "", quote_currency: "", status: "Completed",
      timestamp: "2026-02-07T00:00:00Z", total_fiat: ""
    };
    await uc.execute([payload1] as any, 'spot');
  });

  it('Payload 2 - DEPOSIT', async () => {
    await adapter.ensureAccountExists("10000000-0000-0000-0000-000000000007", "TestAccount");
    const payload2 = {
      tx_id: "7a466c8e-4e56-4e4c-9f29-0c0c34a68003", tx_type: "DEPOSIT",
      account_id: "10000000-0000-0000-0000-000000000007",
      amount_in: "500", asset_in: "EUR", destination_address: "ES...",
      fee_amount: "0", fee_currency: "EUR", fiat_currency: "",
      id_hash: "e127becc2373efa4931c7e167f63a1dd3c479fc70d20552368b7087d51264a83",
      metadata: {time: "22:42:54"}, price_fiat: "", quote_currency: "", status: "Completed",
      timestamp: "2026-02-05T00:00:00Z", total_fiat: "", timezone: "Europe/Madrid"
    };
    await uc.execute([payload2] as any, 'spot');
  });

  it('Payload 3 - BUY', async () => {
    await adapter.ensureAccountExists("10000000-0000-0000-0000-000000000007", "TestAccount");
    const payload3 = {
      tx_id: "a00b3738-8d5e-4cee-b074-33a3d074ff77", tx_type: "BUY",
      account_id: "10000000-0000-0000-0000-000000000007",
      amount_in: "0.30338", asset_in: "ETH", destination_address: "",
      fee_amount: "0.7499", fee_currency: "EUR", fiat_currency: "EUR",
      id_hash: "5b48d6229b2e9ad19c5cdedbc396830831c000b9b63511f64c809525be369c3a",
      metadata: {time: "16:29:01.408"}, price_fiat: "1645", quote_currency: "EUR", status: "Completed",
      timestamp: "2026-02-05T00:00:00Z", total_fiat: "-499.81", timezone: "Europe/Madrid"
    };
    await uc.execute([payload3] as any, 'spot');
  });
});
