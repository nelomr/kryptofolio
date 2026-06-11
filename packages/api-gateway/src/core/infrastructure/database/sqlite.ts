import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.ts';
import type { EncryptedArtifact } from '../../domain/ports/ICryptographyPort.ts';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.ts';

export class SqliteVaultRepositoryAdapter implements IVaultCredentialsPort, IUserSettingsPort {

  private db: DatabaseSync;

  constructor() {
    const isMockMode = process.env.MOCK_MODE === 'true';
    let dbUrl = ':memory:';

    if (!isMockMode) {
      if (!process.env.DB_PATH) {
        throw new Error('[SqliteVaultRepositoryAdapter] CRITICAL: DB_PATH environment variable is not defined. Please set it in your .env file or environment.');
      }
      dbUrl = process.env.DB_PATH;
    }

    this.db = new DatabaseSync(dbUrl);
  }

  public async initializeDatabase(): Promise<void> {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_credentials (
            id TEXT PRIMARY KEY,
            service_identifier TEXT UNIQUE NOT NULL,
            ciphertext BLOB NOT NULL,
            initialization_vector BLOB NOT NULL,
            authentication_tag BLOB NOT NULL,
            is_enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS vault_metadata (
            key TEXT PRIMARY KEY,
            value BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (err) {
      throw new Error(`[Database] Critical failure initializing vault tables: ${err}`);
    }
  }

  public async getSetting(key: string): Promise<string | null> {
    const stmt = this.db.prepare('SELECT value FROM user_settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }

  public async getConfiguredServices(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT service_identifier FROM system_credentials');
    const rows = stmt.all() as { service_identifier: string }[];
    return rows.map(r => r.service_identifier);
  }

  public async getEnabledServices(): Promise<string[]> {
    try {
      const stmt = this.db.prepare('SELECT service_identifier FROM system_credentials WHERE is_enabled = 1');
      const rows = stmt.all() as { service_identifier: string }[];
      return rows.map(r => r.service_identifier);
    } catch (e) {
      // Fallback if column doesn't exist for some reason during tests
      return this.getConfiguredServices();
    }
  }

  public async setServiceEnabled(serviceIdentifier: string, enabled: boolean): Promise<void> {
    const stmt = this.db.prepare('UPDATE system_credentials SET is_enabled = ? WHERE service_identifier = ?');
    stmt.run(enabled ? 1 : 0, serviceIdentifier);
  }

  public async saveCredential(serviceIdentifier: string, artifact: EncryptedArtifact): Promise<void> {
    const stmt = this.db.prepare(`
        INSERT INTO system_credentials (id, service_identifier, ciphertext, initialization_vector, authentication_tag, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(service_identifier) DO UPDATE SET
          ciphertext = excluded.ciphertext,
          initialization_vector = excluded.initialization_vector,
          authentication_tag = excluded.authentication_tag,
          is_enabled = 1,
          updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      randomUUID(),
      serviceIdentifier,
      artifact.ciphertext,
      artifact.iv,
      artifact.authTag
    );
  }

  public async getCredential(serviceIdentifier: string): Promise<EncryptedArtifact | null> {
    const stmt = this.db.prepare('SELECT ciphertext, initialization_vector, authentication_tag FROM system_credentials WHERE service_identifier = ?');
    const row = stmt.get(serviceIdentifier) as { ciphertext: Uint8Array, initialization_vector: Uint8Array, authentication_tag: Uint8Array } | undefined;

    if (!row) return null;

    return {
      ciphertext: Buffer.from(row.ciphertext),
      iv: Buffer.from(row.initialization_vector),
      authTag: Buffer.from(row.authentication_tag)
    };
  }

  public async getMetadata(key: string): Promise<Buffer | null> {
    const stmt = this.db.prepare('SELECT value FROM vault_metadata WHERE key = ?');
    const row = stmt.get(key) as { value: Uint8Array } | undefined;

    if (!row) return null;

    return Buffer.from(row.value);
  }

  public async setMetadata(key: string, value: Buffer): Promise<void> {
    const stmt = this.db.prepare(`
        INSERT INTO vault_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }
}
