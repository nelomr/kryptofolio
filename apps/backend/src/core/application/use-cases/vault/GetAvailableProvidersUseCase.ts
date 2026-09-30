import type { VaultProvider } from '../../../domain/models/VaultProvider.js';

export class GetAvailableProvidersUseCase {
  public async execute(): Promise<VaultProvider[]> {
    return [
      {
        id: 'kraken',
        name: 'Kraken',
        category: { kind: 'exchange' },
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'binance',
        name: 'Binance',
        category: { kind: 'exchange' },
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'coinbase',
        name: 'Coinbase',
        category: { kind: 'exchange' },
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'bit2me',
        name: 'Bit2Me',
        category: { kind: 'exchange' },
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
          { key: 'apiSecret', type: 'password', label: 'API Secret' },
        ],
      },
      {
        id: 'coingecko',
        name: 'CoinGecko',
        category: { kind: 'market-data' },
        fields: [
          { key: 'apiKey', type: 'text', label: 'API Key' },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        category: { kind: 'ai-model' },
        fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        category: { kind: 'ai-model' },
        fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
      },
      {
        id: 'google',
        name: 'Google',
        category: { kind: 'ai-model' },
        fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        category: { kind: 'ai-model' },
        fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
      },
      {
        id: 'ollama',
        name: 'Ollama',
        category: { kind: 'ai-model' },
        fields: [],
      },
      {
        id: 'ollama-cloud',
        name: 'Ollama Cloud',
        category: { kind: 'ai-model' },
        fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
      },
    ];
  }
}
