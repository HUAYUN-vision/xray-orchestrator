import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE } from '../../i18n/i18n.constants';
import { I18nService } from '../../i18n/i18n.service';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';

/** Commands shown in the Telegram menu; descriptions come from `command-<name>` keys. */
export const MENU_COMMANDS = ['start', 'help', 'language'] as const;

/** Basic commands: /start and /help, plus the localized command menu. */
@Injectable()
export class CommandsHandler implements BotHandler {
  private readonly logger = new Logger(CommandsHandler.name);

  constructor(private readonly i18n: I18nService) {}

  register(bot: AppBot): void {
    bot.command('start', (ctx) => this.start(ctx));
    bot.command('help', (ctx) => this.help(ctx));
  }

  /** Sets the command menu per locale; the default-locale menu also serves other languages. */
  async init(bot: AppBot): Promise<void> {
    try {
      for (const locale of this.i18n.locales) {
        const commands = MENU_COMMANDS.map((command) => ({
          command,
          description: this.i18n.t(locale, `command-${command}`),
        }));
        await bot.api.setMyCommands(commands, { language_code: locale });
        if (locale === DEFAULT_LOCALE) await bot.api.setMyCommands(commands);
      }
    } catch (err) {
      // Menu is cosmetic: don't block startup on it.
      this.logger.warn(`Failed to set bot commands: ${String(err)}`);
    }
  }

  async start(ctx: BotContext): Promise<void> {
    await ctx.reply(ctx.t('start', { name: ctx.from?.first_name ?? '' }));
  }

  async help(ctx: BotContext): Promise<void> {
    await ctx.reply(ctx.t('help'));
  }
}
