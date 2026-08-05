/**
 * Ingestion Route.
 *
 * Verifies that POST /transactions:
 *  - accepts a valid payload and returns 201
 *  - delegates to the orchestrating use case with the correct rows
 *  - carries the rebuild outcome back to the caller
 *  - returns 500 when the use case throws
 *  - returns 400 when the payload is malformed (zValidator)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createIngestionApi } from "../ingestion.js";
import type { DIContainer } from "../../di/container.js";

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };

const SUMMARY = {
  taxLots: { ...EMPTY_RECONCILIATION, inserted: 1 },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION },
  custodyEntries: { ...EMPTY_RECONCILIATION, inserted: 2 },
  flagged: 3,
  pendingReview: 2,
};

function makeMockContainer(): DIContainer {
  return {
    ingestAndMaterializeUseCase: {
      execute: vi.fn(async ({ rows }: { rows: unknown[] }) => ({
        ingestion: { persisted: rows.length, rejected: [], unresolvedFiat: 0, pendingFeeReview: [] },
        materialization: SUMMARY,
        materialized: true,
        materializationError: null,
      })),
    },
    // Present on the container but never reachable from this route: the ordering between them is
    // the orchestrator's decision.
    csvIngestionUseCase: { execute: vi.fn() },
    fifoMaterializerService: { recalculate: vi.fn() },
  } as unknown as DIContainer;
}

const orchestrator = (container: DIContainer) =>
  container.ingestAndMaterializeUseCase.execute as ReturnType<typeof vi.fn>;

const VALID_ROW = {
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

  it("returns 201 and delegates the submitted rows to the orchestrator", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      processedCount: number;
    };
    expect(body.status).toBe("success");
    expect(body.processedCount).toBe(1);
    expect(orchestrator(container)).toHaveBeenCalledOnce();

    // The row reaches the orchestrator as submitted, account and all, and with no identifier: the
    // use case derives that from the row it persists.
    const [{ rows, market }] = orchestrator(container).mock.calls[0];
    expect(rows[0].id_hash).toBeUndefined();
    expect(rows[0].account_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(market).toBe("spot");
  });

  it("sequences nothing itself: it never reaches ingestion or the materialiser directly", async () => {
    await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(container.csvIngestionUseCase.execute).not.toHaveBeenCalled();
    expect(container.fifoMaterializerService.recalculate).not.toHaveBeenCalled();
    expect(orchestrator(container)).toHaveBeenCalledOnce();
  });

  it("carries the reconciliation summary and the pending-review count", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    const body = (await res.json()) as {
      materialized: boolean;
      pendingReview: number;
      materialization: typeof SUMMARY | null;
    };
    expect(body.materialized).toBe(true);
    expect(body.pendingReview).toBe(2);
    expect(body.materialization).toEqual(SUMMARY);
  });

  it("reports a failed rebuild as a successful ingestion that still needs recalculation", async () => {
    orchestrator(container).mockResolvedValueOnce({
      ingestion: { persisted: 1, rejected: [], unresolvedFiat: 0, pendingFeeReview: [] },
      materialization: null,
      materialized: false,
      materializationError: "Catalog Error: v_custody_entries",
    });

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      status: string;
      processedCount: number;
      materialized: boolean;
      materializationError: string | null;
      pendingReview: number;
    };
    expect(body.status).toBe("success");
    expect(body.processedCount).toBe(1);
    expect(body.materialized).toBe(false);
    expect(body.materializationError).toContain("v_custody_entries");
    expect(body.pendingReview).toBe(0);
  });

  it("counts only the persisted rows and names the rejected ones", async () => {
    orchestrator(container).mockResolvedValueOnce({
      ingestion: {
        persisted: 1,
        rejected: [
          {
            idHash: "hash-bad",
            timestamp: "2023-01-15T10:00:00Z",
            txType: "LIQUIDATION_TRANSFER",
            reason:
              "Unmapped transaction type 'LIQUIDATION_TRANSFER' in row at 2023-01-15T10:00:00Z",
          },
        ],
        unresolvedFiat: 0,
        pendingFeeReview: [],
      },
      materialization: SUMMARY,
      materialized: true,
      materializationError: null,
    });

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW, { ...VALID_ROW, tx_type: "LIQUIDATION_TRANSFER" }],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      processedCount: number;
      message: string;
      rejected: Array<{
        idHash: string;
        timestamp: string;
        txType: string | null;
        reason: string;
      }>;
      unresolvedFiat: number;
    };
    expect(body.processedCount).toBe(1);
    expect(body.message).toContain("LIQUIDATION_TRANSFER");
    expect(body.rejected).toEqual([
      {
        idHash: "hash-bad",
        timestamp: "2023-01-15T10:00:00Z",
        txType: "LIQUIDATION_TRANSFER",
        reason:
          "Unmapped transaction type 'LIQUIDATION_TRANSFER' in row at 2023-01-15T10:00:00Z",
      },
    ]);
    expect(body.unresolvedFiat).toBe(0);
  });

  it("reports an empty rejection list rather than omitting the field", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { rejected: unknown[] };
    expect(body.rejected).toEqual([]);
  });

  it("reports how many persisted rows carry an unresolved fiat magnitude", async () => {
    orchestrator(container).mockResolvedValueOnce({
      ingestion: { persisted: 2, rejected: [], unresolvedFiat: 2, pendingFeeReview: [] },
      materialization: SUMMARY,
      materialized: true,
      materializationError: null,
    });

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    const body = (await res.json()) as { unresolvedFiat: number };
    expect(body.unresolvedFiat).toBe(2);
  });

  it("refuses to emit a rejection that lost its reason", async () => {
    orchestrator(container).mockResolvedValueOnce({
      ingestion: {
        persisted: 0,
        rejected: [{ idHash: "hash-bad", timestamp: "2023-01-15T10:00:00Z", txType: null }],
        unresolvedFiat: 0,
        pendingFeeReview: [],
      },
      materialization: SUMMARY,
      materialized: true,
      materializationError: null,
    });

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(res.status).toBe(500);
  });

  it("reports rows whose fee could not be resolved, distinctly from a pending price", async () => {
    orchestrator(container).mockResolvedValueOnce({
      ingestion: {
        persisted: 1,
        rejected: [],
        unresolvedFiat: 0,
        pendingFeeReview: [
          {
            idHash: "hash-fee",
            timestamp: "2023-01-15T10:00:00Z",
            reason: "Bitvavo's running-balance invariant could not verify this fee's convention",
          },
        ],
      },
      materialization: SUMMARY,
      materialized: true,
      materializationError: null,
    });

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      pendingFeeReview: Array<{ idHash: string; timestamp: string; reason: string }>;
      pendingReview: number;
    };
    expect(body.pendingFeeReview).toEqual([
      {
        idHash: "hash-fee",
        timestamp: "2023-01-15T10:00:00Z",
        reason: "Bitvavo's running-balance invariant could not verify this fee's convention",
      },
    ]);
    // A pending fee is not a pending price: folding the two would make one unresolvable defect
    // look like the other, which is exactly the ambiguity D13's nullability split exists to avoid.
    expect(body.pendingReview).toBe(2);
  });

  it("reports an empty pending-fee-review list rather than omitting the field", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC", sourceProfileId: "kraken-spot" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { pendingFeeReview: unknown[] };
    expect(body.pendingFeeReview).toEqual([]);
  });

  it("returns 500 when the orchestrator throws", async () => {
    orchestrator(container).mockRejectedValueOnce(new Error("FK constraint failed"));

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toContain("FK constraint failed");
  });

  /**
   * The contract carries no identifier: it is derived behind this boundary, from the row that is
   * persisted, which is not the row a client could hash — the legs of one operation are reunited on
   * this side now.
   */
  it("accepts a row that carries no identifier, and asks for none", async () => {
    const rowWithoutHash = { ...VALID_ROW };

    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [rowWithoutHash],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(201);
    expect(orchestrator(container)).toHaveBeenCalled();
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
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(400);
    expect(orchestrator(container)).not.toHaveBeenCalled();
  });

  it("returns 400 when market is an unknown value", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "options",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(400);
    expect(orchestrator(container)).not.toHaveBeenCalled();
  });

  it("accepts futures market type", async () => {
    const futuresRow = {
      ...VALID_ROW,
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
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(201);
    const [{ market }] = orchestrator(container).mock.calls[0];
    expect(market).toBe("futures");
  });
});

/**
 * The identifier is required rather than defaulted. A default would put the pipeline back where D16
 * left `toSpotTxType()`: reading a source it was never told about under a convention nobody measured,
 * and reporting success.
 */
describe("POST /ingestion/transactions — the source profile is part of the contract", () => {
  let container: DIContainer;
  let app: Hono;

  beforeEach(() => {
    container = makeMockContainer();
    app = new Hono().route("/ingestion", createIngestionApi(container));
    vi.clearAllMocks();
  });

  it("hands the identifier to the orchestrator", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "kraken-spot",
      }),
    });

    expect(res.status).toBe(201);
    const [{ sourceProfileId }] = orchestrator(container).mock.calls[0];
    expect(sourceProfileId).toBe("kraken-spot");
  });

  it("rejects a submission that names no source profile", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [VALID_ROW], market: "spot", timezone: "UTC" }),
    });

    expect(res.status).toBe(400);
    expect(orchestrator(container)).not.toHaveBeenCalled();
  });

  it("rejects an identifier outside the measured vocabulary", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "coinbase-spot",
      }),
    });

    expect(res.status).toBe(400);
    expect(orchestrator(container)).not.toHaveBeenCalled();
  });

  it("accepts the fallback identifier, which names the uncertainty rather than hiding it", async () => {
    const res = await app.request("/ingestion/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [VALID_ROW],
        market: "spot",
        timezone: "UTC",
        sourceProfileId: "generic",
      }),
    });

    expect(res.status).toBe(201);
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
    expect(orchestrator(container)).not.toHaveBeenCalled();
  });
});
