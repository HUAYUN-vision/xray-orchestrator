import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FluentBundle, type FluentVariable, FluentResource } from '@fluent/bundle';
import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from './i18n.constants';

export type TranslationArgs = Record<string, FluentVariable>;

const LOCALES_DIR = join(__dirname, 'locales');

/** Fluent translations from `locales/<locale>.ftl`. Usable both in bot handlers and in services. */
@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);
  private readonly bundles = new Map<Locale, FluentBundle>();
  private readonly messageIds = new Map<Locale, string[]>();

  constructor() {
    for (const locale of SUPPORTED_LOCALES) {
      const { bundle, ids } = loadBundle(locale);
      this.bundles.set(locale, bundle);
      this.messageIds.set(locale, ids);
    }
  }

  get locales(): readonly Locale[] {
    return SUPPORTED_LOCALES;
  }

  isSupported(code: string): code is Locale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(code);
  }

  /** Maps a Telegram `language_code` (e.g. `en-US`) to a supported locale, falling back to the default. */
  resolve(languageCode?: string): Locale {
    const base = languageCode?.toLowerCase().split('-')[0];
    return base && this.isSupported(base) ? base : DEFAULT_LOCALE;
  }

  /** Message ids of a locale, for consistency checks. */
  keys(locale: Locale): string[] {
    return [...this.messageIds.get(locale)!];
  }

  t(locale: Locale, key: string, args?: TranslationArgs): string {
    const bundle = this.bundles.get(locale)!;
    const message = bundle.getMessage(key);
    if (!message?.value) {
      this.logger.warn(`Missing translation "${key}" for locale "${locale}"`);
      return locale === DEFAULT_LOCALE ? key : this.t(DEFAULT_LOCALE, key, args);
    }
    const errors: Error[] = [];
    const text = bundle.formatPattern(message.value, args, errors);
    if (errors.length > 0) {
      this.logger.warn(`Translation "${key}" (${locale}): ${errors.map(String).join('; ')}`);
    }
    return text;
  }
}

function loadBundle(locale: Locale): { bundle: FluentBundle; ids: string[] } {
  const source = readFileSync(join(LOCALES_DIR, `${locale}.ftl`), 'utf8');
  const resource = new FluentResource(source);
  // useIsolating=false: no Unicode bidi marks around variables, Telegram shows them as junk.
  const bundle = new FluentBundle(locale, { useIsolating: false });
  const errors = bundle.addResource(resource);
  if (errors.length > 0) {
    throw new Error(`Invalid ${locale}.ftl: ${errors.map(String).join('; ')}`);
  }
  // Terms (`-name`) are private to the file, only messages are public keys.
  const ids = resource.body.map((entry) => entry.id).filter((id) => !id.startsWith('-'));
  return { bundle, ids };
}
