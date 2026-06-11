import type { VaultProvider } from '../../../domain/models/VaultProvider.ts';

export class GetAvailableProvidersUseCase {
  public async execute(): Promise<VaultProvider[]> {
    // In the future, this could be dynamic, reading from a plugin registry or database.
    // For now, we return the static list of supported providers.
    return [
      {
        id: 'KRAKEN_API',
        name: 'Kraken',
        fields: [
          {
            key: 'apiKey',
            type: 'text',
            label: 'API Key'
          },
          {
            key: 'apiSecret',
            type: 'password',
            label: 'API Secret'
          }
        ]
      }
    ];
  }
}
