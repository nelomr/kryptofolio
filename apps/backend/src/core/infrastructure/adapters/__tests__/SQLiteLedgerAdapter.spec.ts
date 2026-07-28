import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteLedgerAdapter } from "../SQLiteLedgerAdapter";
import type {
  LedgerSpotTransaction,
  LedgerTaxLot,
  LedgerTaxLotEvent,
} from "../../../domain/ports/ILedgerPort";
import { toPreciseAmount } from "../../../domain/value-objects/PreciseAmount.js";

// Load the REAL migration SQL — this is the source of truth for the schema.
// Using the real schema (not a simplified inline schema) catches impedance mismatches.
const MIGRATION_SQL = readFileSync(
  resolve(
    __dirname,
    "../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql",
  ),
  "utf-8",
);

// Migration 003 adds fiat_currency to spot/futures_transactions + exchange_rates table.
const MIGRATION_003_SQL = readFileSync(
  resolve(
    __dirname,
    "../../../../../../../packages/database/migrations/sqlite/003_currency_schema.sql",
  ),
  "utf-8",
);

/** Helper to build a minimal but valid spot transaction */
function makeSpotTx(
  overrides: Partial<LedgerSpotTransaction> = {},
): LedgerSpotTransaction {
  return {
    id: "tx-001",
    id_hash: "hash-abc123",
    account_id: '10000000-0000-0000-0000-000000000001',
    timestamp: "2023-01-15T10:00:00Z",
    tx_type: "BUY",
    amount_in: toPreciseAmount("0.15"),
    asset_in_id: "asset-btc",
    amount_out: toPreciseAmount("4500.50"),
    asset_out_id: "asset-eur",
    fee_amount: toPreciseAmount("4.50"),
    fee_asset_id: "asset-eur",
    total_fiat: toPreciseAmount("4500.50"),
    price_fiat: toPreciseAmount("30003.33"),
    fiat_currency: "EUR",
    status: "COMPLETED",
    ...overrides,
  };
}

/** Helper to build a valid tax lot */
function makeTaxLot(overrides: Partial<LedgerTaxLot> = {}): LedgerTaxLot {
  return {
    id: "lot-001",
    spot_transaction_id: "tx-001",
    asset_id: "asset-btc",
    account_id: '10000000-0000-0000-0000-000000000001',
    original_qty: toPreciseAmount("1.5"),
    remaining_qty: toPreciseAmount("0.5"),
    unit_cost_fiat: toPreciseAmount("30000"),
    total_cost_fiat: toPreciseAmount("45000"),
    fiat_currency: "EUR",
    acquisition_timestamp: "2023-01-15T10:00:00Z",
    exchange_location: "Binance",
    source_tx_id: "native-tx-001",
    status: "PARTIAL",
    ...overrides,
  };
}

describe("SQLiteLedgerAdapter — Integration Tests with Real Migration", () => {
  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(MIGRATION_SQL);
    db.exec(MIGRATION_003_SQL);
    adapter = new SQLiteLedgerAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // Spot Transactions
  // -------------------------------------------------------------------------

  describe("Spot Transactions", () => {
    it("saves and retrieves a spot transaction with correct PreciseAmount parsing", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      const tx = makeSpotTx();
      await adapter.saveSpotTransaction(tx);

      const results = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');

      expect(results).toHaveLength(1);
      expect(results[0].id_hash).toBe("hash-abc123");
      expect(results[0].amount_in).toBe("0.15");
      expect(results[0].amount_out).toBe("4500.50");
      expect(results[0].fee_amount).toBe("4.50");
      expect(results[0].total_fiat).toBe("4500.50");
      expect(results[0].price_fiat).toBe("30003.33");
      expect(results[0].tx_type).toBe("BUY");
      expect(results[0].exchange).toBe("Binance");
    });

    it("only returns transactions for the requested account", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000002', "Kraken");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      await adapter.saveSpotTransaction(
        makeSpotTx({
          id: "tx-001",
          id_hash: "hash-001",
          account_id: '10000000-0000-0000-0000-000000000001',
        }),
      );
      await adapter.saveSpotTransaction(
        makeSpotTx({
          id: "tx-002",
          id_hash: "hash-002",
          account_id: '10000000-0000-0000-0000-000000000002',
        }),
      );

      const binanceTxs = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      const krakenTxs = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000002');

      expect(binanceTxs).toHaveLength(1);
      expect(krakenTxs).toHaveLength(1);
      expect(binanceTxs[0].id).toBe("tx-001");
      expect(krakenTxs[0].id).toBe("tx-002");
    });

    it("returns all transactions when account_id is undefined", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000002', "Kraken");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      await adapter.saveSpotTransaction(
        makeSpotTx({
          id: "tx-001",
          id_hash: "hash-001",
          account_id: '10000000-0000-0000-0000-000000000001',
        }),
      );
      await adapter.saveSpotTransaction(
        makeSpotTx({
          id: "tx-002",
          id_hash: "hash-002",
          account_id: '10000000-0000-0000-0000-000000000002',
        }),
      );

      const allTxs = await adapter.getSpotTransactions();
      expect(allTxs).toHaveLength(2);
    });

    it("upserts transaction on id_hash collision (idempotent ingestion)", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      const txInitial = makeSpotTx({
        id: "tx-001",
        id_hash: "same-hash",
        total_fiat: toPreciseAmount("1000"),
      });
      await adapter.saveSpotTransaction(txInitial);

      const txUpdated = makeSpotTx({
        id: "tx-002",
        id_hash: "same-hash",
        total_fiat: toPreciseAmount("5000"),
      });
      await adapter.saveSpotTransaction(txUpdated);

      const results = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      expect(results).toHaveLength(1);
      expect(results[0].total_fiat).toBe("5000");
    });

    it("does NOT return soft-deleted transactions", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      await adapter.saveSpotTransaction(makeSpotTx());
      db.exec(
        `UPDATE spot_transactions SET deleted_at = datetime('now', 'utc') WHERE id = 'tx-001'`,
      );

      const results = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // S-2: UPSERT Resurrection
  // -------------------------------------------------------------------------

  describe("UPSERT Idempotency & Resurrection (S-2)", () => {
    it("resurrects a soft-deleted transaction on re-insert with same id_hash", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      const tx = makeSpotTx();

      // 1. Insert original
      await adapter.saveSpotTransaction(tx);

      // 2. Soft-delete it
      db.exec(
        `UPDATE spot_transactions SET deleted_at = datetime('now', 'utc') WHERE id_hash = 'hash-abc123'`,
      );
      const deletedResults = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      expect(deletedResults).toHaveLength(0);

      // 3. Re-insert with the same id_hash — should resurrect (deleted_at = NULL)
      await adapter.saveSpotTransaction({
        ...tx,
        total_fiat: toPreciseAmount("5000"),
      });
      const resurrectedResults = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');

      expect(resurrectedResults).toHaveLength(1);
      expect(resurrectedResults[0].id_hash).toBe("hash-abc123");
      expect(resurrectedResults[0].total_fiat).toBe("5000");
    });

    it("does NOT create duplicate rows when the same id_hash is inserted twice", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      const tx = makeSpotTx();
      await adapter.saveSpotTransaction(tx);
      await adapter.saveSpotTransaction(tx); // Exact same id_hash

      const results = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      expect(results).toHaveLength(1); // Only one row, no duplicate
    });
  });

  // -------------------------------------------------------------------------
  // S-1: Audit Log Trigger
  // -------------------------------------------------------------------------

  describe("Audit Log Trigger (S-1)", () => {
    it("inserts an audit_log record when a spot_transaction is updated", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      await adapter.saveSpotTransaction(makeSpotTx());

      // Perform an UPDATE to trigger the audit trigger
      db.exec(
        `UPDATE spot_transactions SET status = 'ADJUSTED', updated_at = datetime('now', 'utc') WHERE id = 'tx-001'`,
      );

      const auditRows = db
        .prepare(
          `SELECT * FROM audit_log WHERE table_name = 'spot_transactions' AND record_id = 'tx-001'`,
        )
        .all() as Record<string, unknown>[];

      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      expect(auditRows[0].action).toBe("UPDATE");

      // Verify audit_log did not create infinite recursion (only one row expected for one update)
      expect(auditRows.length).toBeLessThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Tax Lots
  // -------------------------------------------------------------------------

  describe("Tax Lots", () => {
    it("saves and retrieves a tax lot with all required fields", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");
      await adapter.saveSpotTransaction(makeSpotTx());

      const lot = makeTaxLot();
      await adapter.createTaxLot(lot);

      const results = await adapter.getTaxLots('10000000-0000-0000-0000-000000000001');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("lot-001");
      expect(results[0].original_qty).toBe("1.5");
      expect(results[0].remaining_qty).toBe("0.5");
      expect(results[0].unit_cost_fiat).toBe("30000");
      expect(results[0].total_cost_fiat).toBe("45000");
      expect(results[0].fiat_currency).toBe("EUR");
      expect(results[0].acquisition_timestamp).toBe("2023-01-15T10:00:00Z");
      expect(results[0].exchange_location).toBe("Binance");
      expect(results[0].status).toBe("PARTIAL");
    });

    it("rejects invalid status values not in OPEN/PARTIAL/CLOSED", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");
      await adapter.saveSpotTransaction(makeSpotTx());

      // The SQL CHECK constraint should reject 'FULL', 'EMPTY', or random values
      expect(() => {
        db.exec(`
          INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
            unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
          VALUES ('lot-bad', 'tx-001', 'asset-btc', '10000000-0000-0000-0000-000000000001', '1', '1', '100', '100', 'EUR',
            '2023-01-01T00:00:00Z', 'Binance', 'FULL')
        `);
      }).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // S-3: Lot History Events
  // -------------------------------------------------------------------------

  describe("Lot History Events (S-3)", () => {
    it("saves and retrieves lot history events", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");
      await adapter.saveSpotTransaction(makeSpotTx());
      await adapter.createTaxLot(makeTaxLot());

      const event: LedgerTaxLotEvent = {
        id: "evt-001",
        tax_lot_id: "lot-001",
        spot_transaction_id: "tx-001",
        account_id: '10000000-0000-0000-0000-000000000001',
        disposal_date: "2023-06-01T10:00:00Z",
        amount_from_lot: toPreciseAmount("0.5"),
        sale_price_fiat: toPreciseAmount("35000"),
        gain_loss_fiat: toPreciseAmount("2500"),
        fiat_currency: "EUR",
        is_taxable: true,
        flag: null,
        notes: "Test disposal",
      };

      await adapter.saveLotHistoryEvent(event);
      const results = await adapter.getLotHistoryEvents('10000000-0000-0000-0000-000000000001');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("evt-001");
      expect(results[0].amount_from_lot).toBe("0.5");
      expect(results[0].sale_price_fiat).toBe("35000");
      expect(results[0].gain_loss_fiat).toBe("2500");
      expect(results[0].is_taxable).toBe(true);
      expect(results[0].disposal_date).toBe("2023-06-01T10:00:00Z");
    });
  });

  // -------------------------------------------------------------------------
  // FK Constraint Enforcement
  // -------------------------------------------------------------------------

  describe("Foreign Key Enforcement", () => {
    it("rejects a spot_transaction with a non-existent account_id (FK enforced)", async () => {
      await expect(async () => {
        // Without calling ensureAccountExists first, FK should fail
        await adapter.saveSpotTransaction(
          makeSpotTx({ account_id: '10000000-0000-0000-0000-000000000999' }),
        );
      }).rejects.toThrow();
    });

    it("resolves FK by calling ensureAccountExists + ensureAssetExists before insert", async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', "Binance");
      await adapter.ensureAssetExists("asset-btc", "BTC");
      await adapter.ensureAssetExists("asset-eur", "EUR");

      await expect(
        adapter.saveSpotTransaction(makeSpotTx()),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // fiat_currency propagation (tasks 1.3, 1.5)
  // -------------------------------------------------------------------------

  describe('fiat_currency propagation', () => {
    it('[Task 1.3/1.5] saves fiat_currency on spot transaction and retrieves it correctly', async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', 'Binance');
      await adapter.ensureAssetExists('asset-btc', 'BTC');
      await adapter.ensureAssetExists('asset-usd', 'USD');

      await adapter.saveSpotTransaction(
        makeSpotTx({ fiat_currency: 'USD', fee_asset_id: 'asset-usd', asset_out_id: 'asset-usd' }),
      );

      const results = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000001');
      expect(results).toHaveLength(1);
      expect(results[0].fiat_currency).toBe('USD');
    });

    it('[Task 1.3/1.5] saves fiat_currency on futures transaction and retrieves it correctly', async () => {
      await adapter.ensureAccountExists('10000000-0000-0000-0000-000000000001', 'Binance');
      await adapter.ensureAssetExists('USDT', 'USDT');

      await adapter.saveFuturesTransaction({
        id: 'f-001',
        id_hash: 'fhash-001',
        account_id: '10000000-0000-0000-0000-000000000001',
        tx_type: 'TRADE',
        symbol: 'BTCUSDT',
        realized_pnl: toPreciseAmount('150.00'),
        fiat_currency: 'USD',
        timestamp: '2023-03-01T12:00:00Z',
        status: 'COMPLETED',
      });

      const results = await adapter.getFuturesTransactions('10000000-0000-0000-0000-000000000001');
      expect(results).toHaveLength(1);
      expect(results[0].fiat_currency).toBe('USD');
    });
  });
});
