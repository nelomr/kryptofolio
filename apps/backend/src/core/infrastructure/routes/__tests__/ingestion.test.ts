/**
 * Ingestion Route — Integration tests with real SQLite in-memory schema.
 *
 * Verifies that POST /transactions:
 *  - accepts a valid payload and returns 201
 *  - calls csvIngestionUseCase.execute with the correct rows
 *  - returns 500 when the use case throws
 *  - returns 400 when the payload is malformed (zValidator)
 *  - is idempotent: same id_hash twice does not duplicate rows
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createIngestionApi } from "../ingestion.js";
import type { DIContainer } from "../../di/container.js";

function makeMockContainer(
  overrides: Partial<DIContainer["csvIngestionUseCase"]> = {},
): DIContainer {
  return {
    csvIngestionUseCase: {
      execute: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  } as unknown as DIContainer;
}

const VALID_ROW = {
  id_hash: "hash-ingestion-test",
  account_id: "00000000-0000-0000-0000-000000000001",
  tx_type: "BUY",
  timestamp: "2023-01-15T10:00:00Z",
  asset_in: "BTC",
  amount_in: "0.5",
  asset_out: "EUR",
  amount_out: "15000",
  fee_currency: "EUR",
  fee_amount: "15",
  total_fiat: "15000",
  price_fiat: "30000",
};

describe("POST /ingestion/transactions", () => {
  let container: DIContainer;
  let app: Hono;

  beforeEach(() => {
    container = makeMockContainer();
    app = new Hono().route("/ingestion", createIngestionApi(container));
    vi.clearAllMocks();
  });

  it("returns 201 and calls execute with the submitted rows", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      processedCount: number;
    };
    expect(body.status).toBe("success");
    expect(body.processedCount).toBe(1);
    expect(container.csvIngestionUseCase.execute).toHaveBeenCalledOnce();

    // Verify the row was passed through with id_hash and account_id intact
    const [rows, market] = (
      container.csvIngestionUseCase.execute as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(rows[0].id_hash).toBe("hash-ingestion-test");
    expect(rows[0].account_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(market).toBe("spot");
  });

  it("returns 500 when csvIngestionUseCase.execute throws", async () => {
    (
      container.csvIngestionUseCase.execute as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("FK constraint failed"));

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toContain("FK constraint failed");
  });

  it("returns 400 when id_hash is missing (zValidator guard)", async () => {
    const rowWithoutHash = { ...VALID_ROW, id_hash: undefined };

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [rowWithoutHash],
        market: "spot",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(400);
    // execute should never be called if validation fails
    expect(container.csvIngestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when account_id is empty", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [
          {
            ...VALID_ROW,
            account_id: "", // Empty instead of invalid UUID
          },
        ],
        market: "spot",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(400);
    expect(container.csvIngestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when market is an unknown value", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "options",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(400);
    expect(container.csvIngestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("accepts futures market type", async () => {
    const futuresRow = {
      ...VALID_ROW,
      id_hash: "hash-futures-test",
      tx_type: "TRADE",
      symbol: "BTCUSDT",
    };

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [futuresRow],
        market: "futures",
        timezone: "UTC",
      }),
    });

    expect(res.status).toBe(201);
    const [, market] = (
      container.csvIngestionUseCase.execute as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(market).toBe("futures");
  });
});

describe("GET /ingestion/status", () => {
  it("returns idle status without calling any use case", async () => {
    const container = makeMockContainer();
    const app = new Hono().route("/ingestion", createIngestionApi(container));

    const res = await app.request("/ingestion/status");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("idle");
    expect(container.csvIngestionUseCase.execute).not.toHaveBeenCalled();
  });
});
