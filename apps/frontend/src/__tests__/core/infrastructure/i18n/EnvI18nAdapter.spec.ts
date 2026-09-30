import { describe, it, expect, vi } from 'vitest';
import { EnvI18nAdapter } from '@/core/infrastructure/i18n/EnvI18nAdapter';

describe('EnvI18nAdapter', () => {
  it('translates a simple key correctly', () => {
    const dictionary = { 'hello': 'Hola' };
    const adapter = new EnvI18nAdapter(dictionary);
    expect(adapter.translate('hello')).toBe('Hola');
  });

  it('interpolates parameters correctly', () => {
    const dictionary = { 'greeting': 'Hola {name}, tienes {count} mensajes' };
    const adapter = new EnvI18nAdapter(dictionary);
    expect(adapter.translate('greeting', { name: 'Jhon', count: '5' })).toBe('Hola Jhon, tienes 5 mensajes');
  });

  it.each(['$&', '$$', '$1', '$`'])('inserts a parameter containing the replacement pattern %s literally', (value) => {
    const adapter = new EnvI18nAdapter({ ask: 'Question: {q}' });

    expect(adapter.translate('ask', { q: value })).toBe(`Question: ${value}`);
  });

  it('does not expand a placeholder that appears inside another parameter value', () => {
    const adapter = new EnvI18nAdapter({ greeting: '{name} has {count}' });

    expect(adapter.translate('greeting', { name: '{count}', count: '5' })).toBe('{count} has 5');
  });

  it('returns the key and warns if translation is missing', () => {
    const dictionary = {};
    const adapter = new EnvI18nAdapter(dictionary);
    
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    expect(adapter.translate('missing.key')).toBe('missing.key');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[i18n] Missing translation for key: "missing.key"');
    
    consoleWarnSpy.mockRestore();
  });
});
