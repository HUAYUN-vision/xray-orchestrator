import { Inject, Injectable } from '@nestjs/common';
import type { NextFunction } from 'grammy';
import { LOCALE_STORE } from '../../i18n/i18n.constants';
import { I18nService } from '../../i18n/i18n.service';
import type { LocaleStore } from '../../i18n/locale-store';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';

/**
 * Sets `ctx.locale` and `ctx.t` for every update:
 * saved choice → Telegram `language_code` → default locale.
 * Must be registered before any handler that replies to the user.
 */
@Injectable()
export class I18nMiddleware implements BotHandler {
  constructor(
    private readonly i18n: I18nService,
    @Inject(LOCALE_STORE) private readonly store: LocaleStore,
  ) {}

  register(bot: AppBot): void {
    bot.use((ctx, next) => this.handle(ctx, next));
  }

  async handle(ctx: BotContext, next: NextFunction): Promise<void> {
    const user = ctx.from;
    ctx.locale =
      (user && (await this.store.get(user.id))) ?? this.i18n.resolve(user?.language_code);
    ctx.t = (key, args) => this.i18n.t(ctx.locale, key, args);
    await next();
  }
}
