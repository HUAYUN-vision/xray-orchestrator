import { Inject, Injectable } from '@nestjs/common';
import { LOCALE_STORE } from '../../i18n/i18n.constants';
import { I18nService } from '../../i18n/i18n.service';
import type { LocaleStore } from '../../i18n/locale-store';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';

/**
 * /language — show the current language, /language <code> — switch it.
 * Temporary text UI; moves into the widget in stage 4.
 */
@Injectable()
export class LanguageHandler implements BotHandler {
  constructor(
    private readonly i18n: I18nService,
    @Inject(LOCALE_STORE) private readonly store: LocaleStore,
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

    if (ctx.from) await this.store.set(ctx.from.id, code);
    ctx.locale = code;
    await ctx.reply(ctx.t('language-changed', { language: ctx.t('language-name') }));
  }
}
