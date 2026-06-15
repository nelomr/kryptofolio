import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import mockPortfolio from "./data/mockPortfolio.ts";
import {
  MOCK_TRANSACTIONS,
  MOCK_TAX_REPORT,
  MOCK_FUTURES_TRANSACTIONS,
  MOCK_FUTURES_DERIVATIVES,
} from "./data/mockTax.ts";
import {
  MOCK_KPIS,
  generatePerformanceHistory,
  MOCK_ASSET_ALLOCATION,
  generateVolatilityHeatmap,
  MOCK_RISK_METRICS,
} from "./data/mockMetrics.ts";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import credentialsApi from "./routes/credentials.ts";
import settingsApi from "./routes/settings.ts";
import { container } from "./core/infrastructure/di/container.ts";
import { bffLogger } from "./utils/logger.ts";

export const app = new Hono<{
  Bindings: { MODE?: string; SECRET_API_KEY?: string; PROD_API_URL?: string };
}>();
app.use("/*", cors());

// Proxy Middleware for PROD mode
app.use("/api/*", async (c, next) => {
  const mode = c.env?.MODE || process.env.MODE || "mock";
  const apiKey = c.env?.SECRET_API_KEY || process.env.SECRET_API_KEY || "";
  const apiUrl =
    c.env?.PROD_API_URL || process.env.PROD_API_URL || "http://localhost:8080";

  if (mode !== "prod") {
    return await next(); // Proceed to mock handlers
  }

  const url = new URL(c.req.url);
  const targetUrl = `${apiUrl}${url.pathname}${url.search}`;

  const headers = new Headers(c.req.raw.headers);
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  headers.delete("host");

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ["GET", "HEAD"].includes(c.req.method)
        ? undefined
        : await c.req.raw.blob(),
    });

    const resHeaders = new Headers(response.headers);
    // Don't forward content-encoding to let Hono handle it
    resHeaders.delete("content-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error: unknown) {
    bffLogger.error({ err: error }, "[Proxy] Request failed");
    const message =
      error instanceof Error ? error.message : "Unknown proxy error";
    return c.json({ error: "Proxy Request Failed", details: message }, 502);
  }
});

const routes = app
  .basePath("/api")
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  // Portfolio
  .get("/portfolio/summary", (c) => c.json(mockPortfolio.summary, 200))
  .get("/portfolio/token/:symbol", (c) => c.json({}, 200))
  .get("/portfolio/token/:symbol/history", (c) => {
    const symbol = c.req.param("symbol").toUpperCase();
    const lots = (mockPortfolio.lots as Record<string, any>)[symbol] || [];
    const history =
      (mockPortfolio.history as Record<string, any>)[symbol] || {};
    return c.json({ lots, history }, 200);
  })
  .post(
    "/portfolio/rebuild",
    zValidator("json", z.object({}).optional()),
    (c) => c.json({ success: true }, 200),
  )
  // Wallets
  .get("/wallets", (c) =>
    c.json(
      [{ name: "Main Kraken", type: "EXCHANGE", chainAddresses: [] }],
      200,
    ),
  )
  .post("/wallets/upload", (c) =>
    c.json([{ name: "Imported", type: "WALLET", chainAddresses: [] }], 200),
  )
  // Tax
  .get("/tax/transactions/spot", (c) => c.json(MOCK_TRANSACTIONS, 200))
  .get("/tax/transactions/futures", (c) =>
    c.json(MOCK_FUTURES_TRANSACTIONS, 200),
  )
  .get("/tax/transactions/futures-derivatives", (c) =>
    c.json(MOCK_FUTURES_DERIVATIVES, 200),
  )
  .get("/tax/transactions/invalid", (c) => c.json([], 200))
  .get("/tax/report", (c) => c.json(MOCK_TAX_REPORT, 200))
  .delete("/tax/transactions/:id", (c) => c.json({ success: true }, 200))
  .put(
    "/tax/transactions/:id",
    zValidator("json", z.record(z.unknown())),
    (c) => c.json({ success: true }, 200),
  )
  .post(
    "/tax/transactions/validate",
    zValidator("json", z.record(z.unknown())),
    (c) => c.json({ success: true }, 200),
  )
  .post("/tax/upload", (c) => c.json({ success: true }, 200))
  .post(
    "/tax/import",
    zValidator(
      "json",
      z.object({
        rows: z.array(z.record(z.unknown())),
        market: z.enum(["spot", "futures"]),
        timezone: z.string(),
      }),
    ),
    (c) => c.json({ success: true }, 200),
  )
  .delete("/tax/transactions/market/:market", (c) =>
    c.json({ success: true }, 200),
  )
  .post(
    "/tax/import-wallet",
    zValidator("json", z.object({ chain: z.string(), address: z.string() })),
    (c) => c.json({ success: true }, 200),
  )
  .post("/tax/sync-web3", zValidator("json", z.object({}).optional()), (c) =>
    c.json({ success: true }, 200),
  )
  .get("/tax/report/download", (c) => c.body("PDF content", 200))
  // Metrics
  .get("/metrics/kpis", (c) => c.json(MOCK_KPIS, 200))
  .get("/metrics/allocation", (c) => c.json(MOCK_ASSET_ALLOCATION, 200))
  .get("/metrics/performance", (c) => {
    const days = Number(c.req.query("days") || "30");
    return c.json(generatePerformanceHistory(days), 200);
  })
  .get("/metrics/heatmap", (c) => {
    const year = Number(c.req.query("year") || new Date().getFullYear());
    return c.json(generateVolatilityHeatmap(year), 200);
  })
  .get("/metrics/risk", (c) => c.json(MOCK_RISK_METRICS, 200))
  .get("/metrics/token/:symbol", (c) => c.json({}, 200))
  // Ingestion
  .get("/ingestion/status", (c) =>
    c.json(
      {
        status: "idle",
        progress: 0,
        message: "",
        processedCount: 0,
        totalCount: 0,
      },
      200,
    ),
  )
  // Credentials Vault
  .route("/credentials", credentialsApi)
  // User Settings
  .route("/settings", settingsApi);

export type AppType = typeof routes;

const port = 3001;
if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      await container.vaultCredentialsPort.initializeDatabase();
      bffLogger.info(`BFF is running on port ${port}`);
      serve({ fetch: app.fetch, port });
    } catch (err) {
      bffLogger.fatal({ err }, "[Bootstrap] Failed to initialize API Gateway");
      process.exit(1);
    }
  })();
}
