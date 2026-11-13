import { Injectable } from '@nestjs/common';
import type { NextFunction } from 'grammy';
import { I18nService } from '../../i18n/i18n.service';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { getSender } from '../widget-query';

/**
 * Sets `ctx.locale` and `ctx.t` for every update:
 * user's saved choice → Telegram `language_code` → default locale.
 * Runs after UserMiddleware and before any handler that replies to the user.
 */
@Injectable()
export class I18nMiddleware implements BotHandler {
  constructor(private readonly i18n: I18nService) {}

  register(bot: AppBot): void {
    bot.use((ctx, next) => this.handle(ctx, next));
  }

  async handle(ctx: BotContext, next: NextFunction): Promise<void> {
    const saved = ctx.user?.language;
    ctx.locale =
      saved && this.i18n.isSupported(saved)
        ? saved
        : this.i18n.resolve(getSender(ctx)?.language_code);
    ctx.t = (key, args) => this.i18n.t(ctx.locale, key, args);
    await next();
  }
}
