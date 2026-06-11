import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import credentialsApi from "../../routes/credentials.ts";
import { container } from "../../core/infrastructure/di/container.ts";
import { SqliteVaultRepositoryAdapter } from "../../core/infrastructure/database/sqlite.ts";

describe("Vault API Endpoints", () => {
  beforeAll(async () => {
    // Initialize database tables before any tests (required for salt persistence)
    await container.vaultCredentialsPort.initializeDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /vault/status should return locked initially", async () => {
    // Reset adapter state
    const spy = vi
      .spyOn(container.cryptographyPort, "isUnlocked")
      .mockReturnValueOnce(false);

    const res = await credentialsApi.request("/vault/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isUnlocked: false, configuredServices: [], enabledServices: [] });

    spy.mockRestore();
  });

  it("POST /vault/unlock should unlock vault", async () => {
    const res = await credentialsApi.request("/vault/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(container.cryptographyPort.isUnlocked()).toBe(true);
  });

  it("POST /vault/:service should encrypt and mock-save key", async () => {
    // Ensure unlocked — uses raw Buffer key, skipping salt path
    const testKey = Buffer.from('0'.repeat(64), 'hex');
    await container.cryptographyPort.initialize(testKey);

    const res = await credentialsApi.request("/vault/KRAKEN_API", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { apiKey: "my-secret-key-123" } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'Credentials secured in vault.' });
  });

  it('PATCH /vault/:service/status should toggle the provider status', async () => {
    const spy = vi.spyOn(SqliteVaultRepositoryAdapter.prototype, 'setServiceEnabled').mockResolvedValue();
    
    // Test enable
    const resEnable = await credentialsApi.request("/vault/KRAKEN_API/status", {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(resEnable.status).toBe(200);
    expect(await resEnable.json()).toEqual({ success: true, enabled: true });
    expect(spy).toHaveBeenCalledWith('KRAKEN_API', true);

    // Test disable
    const resDisable = await credentialsApi.request("/vault/KRAKEN_API/status", {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
      headers: { 'Content-Type': 'application/json' }
    });
    expect(resDisable.status).toBe(200);
    expect(await resDisable.json()).toEqual({ success: true, enabled: false });
    expect(spy).toHaveBeenCalledWith('KRAKEN_API', false);

    spy.mockRestore();
  });
});
