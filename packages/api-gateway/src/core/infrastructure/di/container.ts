import { AesGcmCryptographyAdapter } from '../adapters/AesGcmCryptographyAdapter.ts';
import { SqliteVaultPortAdapter } from '../database/sqlite.ts';
import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.ts';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.ts';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.ts';
import { UnlockVaultUseCase } from '../../application/use-cases/vault/UnlockVaultUseCase.ts';
import { StoreServiceCredentialUseCase } from '../../application/use-cases/vault/StoreServiceCredentialUseCase.ts';
import { GetVaultStatusUseCase } from '../../application/use-cases/vault/GetVaultStatusUseCase.ts';
import { GetAvailableProvidersUseCase } from '../../application/use-cases/vault/GetAvailableProvidersUseCase.ts';
import { ToggleVaultProviderUseCase } from '../../application/use-cases/vault/ToggleVaultProviderUseCase.ts';

class DIContainer {
  public cryptographyPort: ICryptographyPort;
  public vaultCredentialsPort: IVaultCredentialsPort;
  public userSettingsPort: IUserSettingsPort;
  public unlockVaultUseCase: UnlockVaultUseCase;
  public storeServiceCredentialUseCase: StoreServiceCredentialUseCase;
  public getVaultStatusUseCase: GetVaultStatusUseCase;
  public getAvailableProvidersUseCase: GetAvailableProvidersUseCase;
  public toggleVaultProviderUseCase: ToggleVaultProviderUseCase;

  constructor() {
    this.cryptographyPort = new AesGcmCryptographyAdapter();
    const sqliteAdapter = new SqliteVaultPortAdapter();
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
