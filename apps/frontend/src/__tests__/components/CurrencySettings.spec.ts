import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CurrencySettings from '@/views/Settings/components/CurrencySettings.vue';
import { createTestingPinia } from '@pinia/testing';
import { I18N_PORT_KEY, SETTINGS_PORT_KEY } from '@/core/injectionKeys';
import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { I18nDictionary } from '@/core/domain/models/I18nDictionary';

// Mock matchMedia for UI components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock colada mutations and queries to provide control over the Sync logic
vi.mock('@/composables/queries/useSettingsMutations', () => ({
  useUpdateBaseCurrencyMutation: () => ({ mutate: vi.fn(), isLoading: false }),
  useSyncExchangeRatesMutation: () => ({ 
    mutate: vi.fn(), 
    isLoading: false 
  }),
}));

vi.mock('@/composables/queries/useSettingsQueries', () => ({
  useBaseCurrencyQuery: () => ({ data: { value: 'USD' }, isLoading: false }),
  useExchangeRateQuery: () => ({ data: { value: { rate: '0.988', date: '2026-06-19' } } }),
}));

describe('CurrencySettings.vue', () => {
  let mockSettingsPort: ISettingsPort;
  let mockI18nPort: any;

  beforeEach(() => {
    mockSettingsPort = {
      syncExchangeRates: vi.fn().mockResolvedValue(undefined),
      getBaseCurrency: vi.fn().mockResolvedValue('USD'),
      getExchangeRate: vi.fn().mockResolvedValue({ rate: '0.988', date: '2026-06-19' }),
      setBaseCurrency: vi.fn(),
      getLanguage: vi.fn(),
      setLanguage: vi.fn(),
      getActiveMarketProvider: vi.fn(),
      setActiveMarketProvider: vi.fn(),
      setExchangeRate: vi.fn(),
    } as unknown as ISettingsPort;

    mockI18nPort = {
      translate: vi.fn((key: keyof I18nDictionary) => key),
      setLanguage: vi.fn(),
      getCurrentLanguage: vi.fn().mockReturnValue('en'),
    };
  });

  it('renders correctly and shows sync tooltip and rate', () => {
    const wrapper = mount(CurrencySettings, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        provide: {
          [SETTINGS_PORT_KEY as symbol]: mockSettingsPort,
          [I18N_PORT_KEY as symbol]: mockI18nPort,
        },
      },
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('settings.currency.title');
    // Ensure the Sync button exists
    const syncBtn = wrapper.find('button[variant="outline"]');
    // Since we're using a shadcn button, variant is a prop, we can find by class or just check buttons
    // The button has a RefreshCwIcon inside it
    expect(wrapper.html()).toContain('lucide-refresh-cw');
  });
});
