import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../../database/repositories/users.repository';
import { I18nService } from '../../i18n/i18n.service';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { WidgetHandler } from './widget.handler';

/**
 * /language — show the current language, /language <code> — switch it.
 * After a change a new widget is sent: its HTML carries the strings of one language.
 */
@Injectable()
export class LanguageHandler implements BotHandler {
  constructor(
    private readonly i18n: I18nService,
    private readonly users: UsersRepository,
    private readonly widget: WidgetHandler,
  ) {}

  register(bot: AppBot): void {
    bot.command('language', (ctx) => this.language(ctx));
  }

  async language(ctx: BotContext): Promise<void> {
    const code = (typeof ctx.match === 'string' ? ctx.match : '').trim().toLowerCase();

    if (!code) {
      const list = this.i18n.locales
        .map((l) => `${l} — ${this.i18n.t(l, 'language-name')}`)
        .join('\n');
      await ctx.reply(ctx.t('language-current', { language: ctx.t('language-name'), list }));
      return;
    }

    if (!this.i18n.isSupported(code)) {
      await ctx.reply(ctx.t('language-unknown', { code, codes: this.i18n.locales.join(', ') }));
      return;
    }

    if (ctx.user) {
      await this.users.setLanguage(ctx.user.telegramId, code);
      ctx.user.language = code;
    }
    ctx.locale = code;
    await ctx.reply(ctx.t('language-changed', { language: ctx.t('language-name') }));
    // Widget HTML is fixed at send time: a new language needs a new widget.
    await this.widget.sendHome(ctx);
  }
}
