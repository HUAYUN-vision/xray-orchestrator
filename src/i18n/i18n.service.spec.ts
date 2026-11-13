import { Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './i18n.constants';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  const i18n = new I18nService();

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('has the same keys in every locale', () => {
    const reference = i18n.keys(DEFAULT_LOCALE).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect({ locale, keys: i18n.keys(locale).sort() }).toEqual({ locale, keys: reference });
    }
  });

  it('formats every message without returning the bare key', () => {
    const args = { name: 'N', language: 'L', list: 'X', code: 'c', codes: 'a, b' };
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of i18n.keys(locale)) {
        expect(i18n.t(locale, key, args)).not.toBe(key);
      }
    }
  });

  it('interpolates variables without bidi isolation marks', () => {
    expect(i18n.t('en', 'start', { name: 'Ann' })).toMatch(/^Hi, Ann!/);
  });

  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['RU', 'ru'],
    ['de', DEFAULT_LOCALE],
    [undefined, DEFAULT_LOCALE],
  ])('resolve(%p) → %p', (code, expected) => {
    expect(i18n.resolve(code)).toBe(expected);
  });

  it('returns the key for an unknown message', () => {
    expect(i18n.t('en', 'no-such-key')).toBe('no-such-key');
  });
});
