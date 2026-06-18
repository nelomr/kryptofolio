import type { VaultProvider } from '../../../domain/models/VaultProvider.js';

export class GetAvailableProvidersUseCase {
  public async execute(): Promise<VaultProvider[]> {
    return [
      {
        id: 'kraken',
        name: 'Kraken',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'binance',
        name: 'Binance',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'coinbase',
        name: 'Coinbase',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'bit2me',
        name: 'Bit2Me',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'coingecko',
        name: 'CoinGecko',
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
        ],
      },
    ];
  }
}
