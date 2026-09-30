import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import VaultSettings from '@/views/Settings/components/VaultSettings.vue';
import VaultProviderCard from '@/views/Settings/components/VaultProviderCard.vue';
import { en } from '@/i18n/dictionaries/en';
import type { VaultProvider } from '@/core/domain/models/VaultEntities';

const PROVIDERS: VaultProvider[] = [
  {
    id: 'kraken',
    name: 'Kraken',
    category: { kind: 'exchange' },
    fields: [
      { key: 'apiKey', type: 'password', label: 'API Key' },
      { key: 'apiSecret', type: 'password', label: 'API Secret' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: { kind: 'ai-model' },
    fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: { kind: 'market-data' },
    fields: [
      { key: 'apiKey', type: 'password', label: 'API Key' },
      { key: 'plan', type: 'text', label: 'Plan' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: { kind: 'ai-model' },
    fields: [{ key: 'apiKey', type: 'password', label: 'API Key' }],
  },
];

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: keyof typeof en) => en[key] || key,
  }),
}));

vi.mock('@/composables/queries/useVaultQueries', () => ({
  useVaultStatusQuery: () => ({
    data: ref({ configuredServices: [], enabledServices: [], isUnlocked: true }),
  }),
  useVaultProvidersQuery: () => ({ data: ref(PROVIDERS) }),
}));

vi.mock('@/composables/queries/useVaultMutations', () => ({
  useUnlockVaultMutation: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
  useSaveVaultKeyMutation: () => ({ mutateAsync: vi.fn(), isLoading: ref(false) }),
  useToggleVaultProviderMutation: () => ({ mutate: vi.fn(), isLoading: ref(false) }),
}));

vi.mock('@/composables/queries/useSettingsQueries', () => ({
  useActiveMarketProviderQuery: () => ({ data: ref('kraken') }),
}));

vi.mock('@/composables/queries/useSettingsMutations', () => ({
  useToggleActiveMarketProviderMutation: () => ({ mutate: vi.fn(), isLoading: ref(false) }),
}));

describe('VaultSettings.vue with an unlocked registry', () => {
  const wrapper = mount(VaultSettings);
  const cards = wrapper.findAllComponents(VaultProviderCard);

  function cardFor(providerId: string) {
    const card = cards.find((c) => c.props('provider').id === providerId);
    if (!card) throw new Error(`no card rendered for ${providerId}`);
    return card;
  }

  it('renders one card per provider', () => {
    expect(cards.map((c) => c.props('provider').id).sort()).toEqual(['anthropic', 'coingecko', 'kraken', 'openai']);
  });

  it('generates one input per entry of the provider fields array, typed as the field declares', () => {
    for (const provider of PROVIDERS) {
      const inputs = cardFor(provider.id).findAll('input');
      expect(inputs.map((i) => i.attributes('type'))).toEqual(provider.fields.map((f) => f.type));
    }
  });

  it('mixes password and text inputs inside one card when its fields do', () => {
    const types = cardFor('coingecko').findAll('input').map((i) => i.attributes('type'));
    expect(types).toEqual(['password', 'text']);
  });

  it('groups providers by category.kind in a fixed order, AI models in their own group', () => {
    const groupHeadings = wrapper.findAll('.space-y-3 > h3');
    expect(groupHeadings.map((h) => h.text())).toEqual([
      en['vault.category.exchange'],
      en['vault.category.market-data'],
      en['vault.category.ai-model'],
    ]);

    const groups = groupHeadings.map((h) => {
      const container = h.element.parentElement;
      const ids = cards
        .filter((c) => container?.contains(c.element))
        .map((c) => c.props('provider').id)
        .sort();
      return ids;
    });
    expect(groups).toEqual([['kraken'], ['coingecko'], ['anthropic', 'openai']]);
  });
});
