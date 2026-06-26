import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { bffLogger } from "../../utils/logger.js";
import { container } from "../di/container.js";

import type { FiatCurrency } from "@kryptofolio/shared-types";
import { SUPPORTED_CURRENCIES } from "@kryptofolio/shared-types";

const settingsApi = new Hono()
  .get("/language", async (c) => {
    try {
      const lang = await container.userSettingsPort.getSetting("language");
      return c.json({ language: lang ?? "en" });
    } catch (err) {
      bffLogger.error({ err }, "Failed to get language setting");
      return c.json({ language: "en" });
    }
  })
  .put(
    "/language",
    zValidator("json", z.object({ language: z.string().min(2).max(10) })),
    async (c) => {
      const { language } = c.req.valid("json");
      try {
        await container.userSettingsPort.setSetting("language", language);
        bffLogger.info({ language }, "Language setting updated");
        return c.json({ success: true, language });
      } catch (err) {
        bffLogger.error({ err }, "Failed to update language setting");
        return c.json(
          { success: false, error: "FAILED_TO_SAVE_LANGUAGE" },
          500,
        );
      }
    },
  )
  .get("/market-provider", async (c) => {
    try {
      const providerId = await container.userSettingsPort.getSetting(
        "active_market_provider",
      );
      return c.json({ providerId: providerId ?? "kraken" });
    } catch (err) {
      bffLogger.error({ err }, "Failed to get active market provider");
      return c.json({ providerId: "kraken" });
    }
  })
  .put(
    "/market-provider",
    zValidator("json", z.object({ providerId: z.string().min(1) })),
    async (c) => {
      const { providerId } = c.req.valid("json");
      try {
        await container.updateActiveMarketProviderUseCase.execute(providerId);
        bffLogger.info({ providerId }, "Active market provider updated");
        return c.json({ success: true, providerId });
      } catch (err) {
        bffLogger.error({ err }, "Failed to update market provider setting");
        return c.json(
          { success: false, error: "FAILED_TO_SAVE_MARKET_PROVIDER" },
          500,
        );
      }
    },
  )
  // ── Base Currency ────────────────────────────────────────────────────────────
  .get("/base-currency", async (c) => {
    try {
      const baseCurrency =
        await container.userSettingsPort.getSetting("base_currency");
      return c.json({ baseCurrency: (baseCurrency as FiatCurrency) ?? "USD" });
    } catch (err) {
      bffLogger.error({ err }, "Failed to get base currency setting");
      return c.json({ baseCurrency: "USD" });
    }
  })
  .put(
    "/base-currency",
    zValidator(
      "json",
      z.object({ baseCurrency: z.enum(SUPPORTED_CURRENCIES) }),
    ),
    async (c) => {
      const { baseCurrency } = c.req.valid("json");
      try {
        await container.userSettingsPort.setSetting(
          "base_currency",
          baseCurrency,
        );
        bffLogger.info({ baseCurrency }, "Base currency setting updated");
        return c.json({ success: true, baseCurrency });
      } catch (err) {
        bffLogger.error({ err }, "Failed to update base currency setting");
        return c.json(
          { success: false, error: "FAILED_TO_SAVE_BASE_CURRENCY" },
          500,
        );
      }
    },
  )
  // ── Exchange Rate ────────────────────────────────────────────────────────────
  .post("/exchange-rate/sync", async (c) => {
    try {
      const { FetchAndStoreExchangeRatesUC } =
        await import("../../application/use-cases/FetchAndStoreExchangeRatesUC.js");
      const useCase = new FetchAndStoreExchangeRatesUC(
        container.userSettingsPort,
        container.exchangeRatePort,
      );
      await useCase.execute();
      bffLogger.info("Successfully fetched and stored ECB exchange rates");
      return c.json({ success: true });
    } catch (err) {
      bffLogger.error({ err }, "Failed to sync exchange rates");
      return c.json({ success: false, error: "FAILED_TO_SYNC_RATES" }, 500);
    }
  })
  .get("/exchange-rate/:key", async (c) => {
    const key = c.req.param("key"); // e.g. "usd_eur"
    try {
      const stored = await container.userSettingsPort.getSetting(
        `exchange_rate_${key}`,
      );
      const date =
        await container.userSettingsPort.getSetting("exchange_rate_date");
      const rate = stored ? stored : null;
      return c.json({ key, rate, date: date ?? null });
    } catch (err) {
      bffLogger.error({ err }, "Failed to get exchange rate");
      return c.json({ key, rate: null, date: null });
    }
  })
  .put(
    "/exchange-rate/:key",
    zValidator("json", z.object({ rate: z.number().positive() })),
    async (c) => {
      const key = c.req.param("key");
      const { rate } = c.req.valid("json");
      try {
        await container.userSettingsPort.setSetting(
          `exchange_rate_${key}`,
          String(rate),
        );
        bffLogger.info({ key, rate }, "Exchange rate updated");
        return c.json({ success: true, key, rate });
      } catch (err) {
        bffLogger.error({ err }, "Failed to update exchange rate");
        return c.json(
          { success: false, error: "FAILED_TO_SAVE_EXCHANGE_RATE" },
          500,
        );
      }
    },
  )
  // ── Supported Accounts ───────────────────────────────────────────────────────
  .get("/accounts", async (c) => {
    try {
      const accounts = await container.ledgerPort.getAccounts();
      const mapped = accounts.map(acc => ({ value: acc.id, label: acc.name }));
      return c.json({ accounts: mapped });
    } catch (err) {
      bffLogger.error({ err }, "Failed to get supported accounts");
      return c.json({ accounts: [] });
    }
  })
  .post(
    "/accounts",
    zValidator(
      "json",
      z.object({
        accounts: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
    ),
    async (c) => {
      const { accounts } = c.req.valid("json");
      try {
        for (const acc of accounts) {
          // The frontend sends the UUID as "value" and the display name as "label"
          await container.ledgerPort.ensureAccountExists(acc.value, acc.label);
        }
        return c.json({ success: true });
      } catch (err) {
        bffLogger.error({ err }, "Failed to set supported accounts");
        return c.json(
          { success: false, error: "FAILED_TO_SAVE_ACCOUNTS" },
          500,
        );
      }
    },
  );

export default settingsApi;
