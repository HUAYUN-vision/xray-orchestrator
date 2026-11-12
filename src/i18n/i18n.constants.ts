export const SUPPORTED_LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

/** DI token for the store of users' chosen languages. */
export const LOCALE_STORE = Symbol('LOCALE_STORE');
