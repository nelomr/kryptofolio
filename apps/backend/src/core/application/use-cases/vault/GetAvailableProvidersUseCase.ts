import type { VaultProvider } from '../../../domain/models/VaultProvider.js';

export class GetAvailableProvidersUseCase {
  public async execute(): Promise<VaultProvider[]> {
    // In the future, this could be dynamic, reading from a plugin registry or database.
    return [
      {
        id: 'KRAKEN_API',
        name: 'Kraken',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
    ];
  }
}
