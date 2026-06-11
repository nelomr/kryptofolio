import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import VaultSettings from '@/components/settings/VaultSettings.vue';
import { en } from '@/i18n/dictionaries/en';

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: keyof typeof en) => en[key] || key
  })
}));

vi.mock('@/composables/queries/useVaultQueries', () => ({
  useVaultStatusQuery: () => ({
    data: ref({ configuredServices: [], isUnlocked: false })
  }),
  useVaultProvidersQuery: () => ({
    data: ref([])
  })
}));

vi.mock('@/composables/queries/useVaultMutations', () => ({
  useUnlockVaultMutation: () => ({
    mutateAsync: vi.fn(),
    isLoading: { value: false }
  }),
  useSaveVaultKeyMutation: () => ({
    mutateAsync: vi.fn(),
    isLoading: { value: false }
  }),
  useToggleVaultProviderMutation: () => ({
    mutate: vi.fn(),
    isPending: { value: false }
  })
}));

describe('VaultSettings.vue', () => {
  it('renders locked state by default', () => {
    const wrapper = mount(VaultSettings);
    
    expect(wrapper.text()).toContain(en['vault.title']);
    expect(wrapper.text()).toContain(en['vault.locked.title']);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });
});
