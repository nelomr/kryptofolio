export interface VaultProviderField {
  key: string;
  type: 'text' | 'password';
  label: string;
}

export interface VaultProvider {
  id: string;
  name: string;
  fields: VaultProviderField[];
}
