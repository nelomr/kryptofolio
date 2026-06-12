import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import LanguageSettings from '@/views/Settings/components/LanguageSettings.vue';
import { I18N_PORT_KEY } from '@/core/injectionKeys';
import type { I18nPort } from '@/core/domain/ports/I18nPort';

// Mock translation to just return the key for simplicity
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const mockMutate = vi.fn();
vi.mock('@/composables/queries/useSettingsMutations', () => ({
  useUpdateLanguageMutation: () => ({
    mutate: mockMutate,
    isLoading: ref(false),
  }),
}));

describe('LanguageSettings.vue', () => {
  let mockI18nPort: I18nPort;

  beforeEach(() => {
    vi.clearAllMocks();
    mockI18nPort = {
      getLocale: vi.fn().mockReturnValue('en'),
      setLocale: vi.fn(),
      translate: vi.fn().mockImplementation((key) => key),
      getSupportedLocales: vi.fn().mockReturnValue([
        { code: 'en', labelKey: 'settings.language.option_en' },
        { code: 'es', labelKey: 'settings.language.option_es' },
      ]),
    };
  });

  it('renders language options and save button', () => {
    const wrapper = mount(LanguageSettings, {
      global: {
        provide: {
          [I18N_PORT_KEY as symbol]: mockI18nPort,
        },
      },
    });

    // Check title and descriptions
    expect(wrapper.text()).toContain('settings.language.title');
    expect(wrapper.text()).toContain('settings.language.description');
    
    // Check save button exists
    const saveBtn = wrapper.find('#language-save-btn');
    expect(saveBtn.exists()).toBe(true);
    expect(saveBtn.text()).toBe('settings.language.save_btn');
  });

  it('calls useUpdateLanguageMutation when save is clicked', async () => {
    const wrapper = mount(LanguageSettings, {
      global: {
        provide: {
          [I18N_PORT_KEY as symbol]: mockI18nPort,
        },
      },
    });

    const saveBtn = wrapper.find('#language-save-btn');
    await saveBtn.trigger('click');

    expect(mockMutate).toHaveBeenCalledWith('en');
  });
});
