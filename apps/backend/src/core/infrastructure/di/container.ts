import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IDatabasePort } from '@kryptofolio/database';
import { NodeSqliteAdapter } from '@kryptofolio/database';
import { AesGcmCryptographyAdapter } from '../adapters/AesGcmCryptographyAdapter.js';
import { SqliteVaultPortAdapter } from '../adapters/SqliteVaultPortAdapter.js';
import { UnlockVaultUseCase } from '../../application/use-cases/vault/UnlockVaultUseCase.js';
import { StoreServiceCredentialUseCase } from '../../application/use-cases/vault/StoreServiceCredentialUseCase.js';
import { GetVaultStatusUseCase } from '../../application/use-cases/vault/GetVaultStatusUseCase.js';
import { GetAvailableProvidersUseCase } from '../../application/use-cases/vault/GetAvailableProvidersUseCase.js';
import { ToggleVaultProviderUseCase } from '../../application/use-cases/vault/ToggleVaultProviderUseCase.js';

/**
 * DIContainer — Composes the application layer.
 *
 * This is the ONLY place that knows about concrete implementations.
 * The domain and application layers only see Port interfaces.
 *
 * To swap the database engine (e.g., to PostgreSQL), replace SqliteVaultPortAdapter
 * with a new PostgresVaultPortAdapter implementing the same interfaces.
 */
class DIContainer {
  public readonly sqlitePort: IDatabasePort;
  public readonly cryptographyPort: ICryptographyPort;
  public readonly vaultCredentialsPort: IVaultCredentialsPort;
  public readonly userSettingsPort: IUserSettingsPort;
  public readonly unlockVaultUseCase: UnlockVaultUseCase;
  public readonly storeServiceCredentialUseCase: StoreServiceCredentialUseCase;
  public readonly getVaultStatusUseCase: GetVaultStatusUseCase;
  public readonly getAvailableProvidersUseCase: GetAvailableProvidersUseCase;
  public readonly toggleVaultProviderUseCase: ToggleVaultProviderUseCase;

  constructor() {
    this.sqlitePort = new NodeSqliteAdapter();
    this.cryptographyPort = new AesGcmCryptographyAdapter();
    const sqliteAdapter = new SqliteVaultPortAdapter(this.sqlitePort);
    this.vaultCredentialsPort = sqliteAdapter;
    this.userSettingsPort = sqliteAdapter;
    this.unlockVaultUseCase = new UnlockVaultUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.storeServiceCredentialUseCase = new StoreServiceCredentialUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.getVaultStatusUseCase = new GetVaultStatusUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.getAvailableProvidersUseCase = new GetAvailableProvidersUseCase();
    this.toggleVaultProviderUseCase = new ToggleVaultProviderUseCase(this.cryptographyPort, this.vaultCredentialsPort);
  }
}

export const container = new DIContainer();
