export interface VaultProviderField {
  key: string;
  type: 'text' | 'password';
  label: string;
}

export type VaultProviderCategory =
  | { kind: 'exchange' }
  | { kind: 'market-data' }
  | { kind: 'ai-model' };

export interface VaultProvider {
  id: string;
  name: string;
  fields: VaultProviderField[];
  category: VaultProviderCategory;
}
