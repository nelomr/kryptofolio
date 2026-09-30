import { describe, it, expect } from 'vitest';
import { ReactiveI18nAdapter } from '@/core/infrastructure/i18n/ReactiveI18nAdapter';
import { en } from '@/i18n/dictionaries/en';

const KEY = 'advisor.refused.rephrase.message';
const TEMPLATE_PREFIX = en[KEY].replace('{question}', '');

describe('ReactiveI18nAdapter interpolation', () => {
  it.each(['$&', '$$', '$1', '$`', "$'", 'cost $& and $$ and $1 and $`'])(
    'inserts the parameter literally when it contains the replacement pattern %s',
    (value) => {
      const adapter = new ReactiveI18nAdapter('en');

      expect(adapter.translate(KEY, { question: value })).toBe(`${TEMPLATE_PREFIX}${value}`);
    },
  );

  it('replaces every occurrence of a placeholder and leaves unknown placeholders untouched', () => {
    const adapter = new ReactiveI18nAdapter('en');

    expect(adapter.translate('common.edit_disabled', { unrelated: 'x' })).toBe(en['common.edit_disabled']);
  });
});
