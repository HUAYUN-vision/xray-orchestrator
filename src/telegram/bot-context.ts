import type { Bot, Context } from 'grammy';
import type { User } from '../database/entities';
import type { Locale } from '../i18n/i18n.constants';
import type { TranslationArgs } from '../i18n/i18n.service';

/** Set by `UserMiddleware`; absent for updates without a sender. */
export interface UserFlavor {
  user?: User;
}

/** Set by `I18nMiddleware`. */
export interface I18nFlavor {
  /** Current user's locale. Assigning it switches `t()` for the rest of the update. */
  locale: Locale;
  t(key: string, args?: TranslationArgs): string;
}

export type BotContext = Context & UserFlavor & I18nFlavor;
export type AppBot = Bot<BotContext>;
