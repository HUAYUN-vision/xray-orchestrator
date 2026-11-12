import { Injectable } from '@nestjs/common';
import type { Bot, Context } from 'grammy';
import type { BotHandler } from '../bot-handler.interface';

// Texts are placeholders until stage 1 (i18n).
const START_TEXT = 'Привет! Я бот для управления ключами Xray.\n\nСписок команд: /help';
const HELP_TEXT = ['Команды:', '/start — начать', '/help — эта справка'].join('\n');

/** Basic commands: /start and /help. */
@Injectable()
export class CommandsHandler implements BotHandler {
  register(bot: Bot): void {
    bot.command('start', (ctx) => this.start(ctx));
    bot.command('help', (ctx) => this.help(ctx));
  }

  async start(ctx: Context): Promise<void> {
    await ctx.reply(START_TEXT);
  }

  async help(ctx: Context): Promise<void> {
    await ctx.reply(HELP_TEXT);
  }
}
