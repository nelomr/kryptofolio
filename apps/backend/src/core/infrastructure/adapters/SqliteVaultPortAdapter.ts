import { randomUUID } from "node:crypto";
import type { IVaultCredentialsPort } from "../../domain/ports/IVaultCredentialsPort.js";
import type { EncryptedArtifact } from "../../domain/ports/ICryptographyPort.js";
import type { IUserSettingsPort } from "../../domain/ports/IUserSettingsPort.js";
import type { IDatabasePort } from "@kryptofolio/database";

/**
 * SqliteVaultPortAdapter — Infrastructure adapter for credentials vault and user settings.
 *
 * Implements BOTH IVaultCredentialsPort and IUserSettingsPort using the generic
 * IDatabasePort. This is the secure local storage for encrypted API keys and app
 * settings.
 */
export class SqliteVaultPortAdapter
  implements IVaultCredentialsPort, IUserSettingsPort
{
  private db: IDatabasePort;

  constructor(db: IDatabasePort) {
    this.db = db;
  }

  public async getSetting(key: string): Promise<string | null> {
    const row = await this.db.queryOne<{ value: string }>(
      "SELECT value FROM user_settings WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    await this.db.execute(
      `
      INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
      [key, value],
    );
  }

  public async getConfiguredServices(): Promise<string[]> {
    const rows = await this.db.queryMany<{ service_identifier: string }>(
      "SELECT service_identifier FROM system_credentials",
    );
    return rows.map((r) => r.service_identifier);
  }

  public async getEnabledServices(): Promise<string[]> {
    try {
      const rows = await this.db.queryMany<{ service_identifier: string }>(
        "SELECT service_identifier FROM system_credentials WHERE is_enabled = 1",
      );
      return rows.map((r) => r.service_identifier);
    } catch (_e) {
      return this.getConfiguredServices();
    }
  }

  public async setServiceEnabled(
    serviceIdentifier: string,
    enabled: boolean,
  ): Promise<void> {
    await this.db.execute(
      "UPDATE system_credentials SET is_enabled = ? WHERE service_identifier = ?",
      [enabled ? 1 : 0, serviceIdentifier],
    );
  }

  public async saveCredential(
    serviceIdentifier: string,
    artifact: EncryptedArtifact,
  ): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO system_credentials (id, service_identifier, ciphertext, initialization_vector, authentication_tag, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(service_identifier) DO UPDATE SET
          ciphertext = excluded.ciphertext,
          initialization_vector = excluded.initialization_vector,
          authentication_tag = excluded.authentication_tag,
          is_enabled = 1,
          updated_at = CURRENT_TIMESTAMP
    `,
      [
        randomUUID(),
        serviceIdentifier,
        artifact.ciphertext,
        artifact.iv,
        artifact.authTag,
      ],
    );
  }

  public async getCredential(
    serviceIdentifier: string,
  ): Promise<EncryptedArtifact | null> {
    const row = await this.db.queryOne<{
      ciphertext: Uint8Array;
      initialization_vector: Uint8Array;
      authentication_tag: Uint8Array;
    }>(
      "SELECT ciphertext, initialization_vector, authentication_tag FROM system_credentials WHERE service_identifier = ?",
      [serviceIdentifier],
    );

    if (!row) return null;

    return {
      ciphertext: Buffer.from(row.ciphertext),
      iv: Buffer.from(row.initialization_vector),
      authTag: Buffer.from(row.authentication_tag),
    };
  }

  public async getMetadata(key: string): Promise<Buffer | null> {
    const row = await this.db.queryOne<{ value: Uint8Array }>(
      "SELECT value FROM vault_metadata WHERE key = ?",
      [key],
    );

    if (!row) return null;

    return Buffer.from(row.value);
  }

  public async setMetadata(key: string, value: Buffer): Promise<void> {
    await this.db.execute(
      `
        INSERT INTO vault_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
      [key, value],
    );
  }
}
