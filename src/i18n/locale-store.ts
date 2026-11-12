import { Injectable } from '@nestjs/common';
import type { Locale } from './i18n.constants';

/** Where users' chosen languages are kept. */
export interface LocaleStore {
  get(userId: number): Promise<Locale | undefined>;
  set(userId: number, locale: Locale): Promise<void>;
}

/**
 * Temporary in-memory store: choices are lost on restart.
 * Replaced by a DB-backed implementation in stage 2.
 */
@Injectable()
export class InMemoryLocaleStore implements LocaleStore {
  private readonly locales = new Map<number, Locale>();

  get(userId: number): Promise<Locale | undefined> {
    return Promise.resolve(this.locales.get(userId));
  }

  set(userId: number, locale: Locale): Promise<void> {
    this.locales.set(userId, locale);
    return Promise.resolve();
  }
}
