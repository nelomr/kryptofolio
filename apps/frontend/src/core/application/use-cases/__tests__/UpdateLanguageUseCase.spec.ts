import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateLanguageUseCase } from '../UpdateLanguageUseCase';
import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { I18nPort } from '@/core/domain/ports/I18nPort';

describe('UpdateLanguageUseCase', () => {
  let mockSettingsPort: ISettingsPort;
  let mockI18nPort: I18nPort;
  let useCase: UpdateLanguageUseCase;

  beforeEach(() => {
    mockSettingsPort = {
      setLanguage: vi.fn().mockResolvedValue(undefined),
      getLanguage: vi.fn().mockResolvedValue('en'),
    } as unknown as ISettingsPort;

    mockI18nPort = {
      getLocale: vi.fn().mockReturnValue('en'),
      setLocale: vi.fn(),
      translate: vi.fn().mockImplementation((key) => key),
      getSupportedLocales: vi.fn().mockReturnValue([
        { code: 'en', labelKey: 'en' },
        { code: 'es', labelKey: 'es' },
      ]),
    };

    useCase = new UpdateLanguageUseCase(mockSettingsPort, mockI18nPort);
  });

  it('falls back to "en" if locale is not supported', async () => {
    await useCase.execute('fr');
    expect(mockSettingsPort.setLanguage).toHaveBeenCalledWith('en');
    expect(mockI18nPort.setLocale).toHaveBeenCalledWith('en');
  });

  it('saves to settings port and updates i18n port when locale is valid', async () => {
    await useCase.execute('es');

    expect(mockSettingsPort.setLanguage).toHaveBeenCalledWith('es');
    expect(mockI18nPort.setLocale).toHaveBeenCalledWith('es');
  });

  it('does not update i18n port if setLanguage throws', async () => {
    mockSettingsPort.setLanguage = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(useCase.execute('es')).rejects.toThrow('Network error');
    
    expect(mockSettingsPort.setLanguage).toHaveBeenCalledWith('es');
    expect(mockI18nPort.setLocale).not.toHaveBeenCalled();
  });
});

