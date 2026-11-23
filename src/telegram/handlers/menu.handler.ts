import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import type { NextFunction } from 'grammy';
import { Currency } from '../../database/enums';
import { TopUpService } from '../../modules/payments/top-up.service';
import { UsersRepository } from '../../database/repositories/users.repository';
import { I18nService } from '../../i18n/i18n.service';
import { WidgetScreensService } from '../../widget/widget-screens.service';
import { parseCommand, type WidgetState } from '../../widget/widget-state';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { money } from '../menu/format';
import {
  CUSTOM_AMOUNT_PREFIX,
  LANGUAGE_PREFIX,
  LANGUAGE_SCREEN,
  MenuService,
  type MenuView,
} from '../menu/menu.service';
import { PaymentMessagesService } from '../payment-messages.service';

/** How long the bot waits for a typed custom amount. */
const AMOUNT_WAIT_MS = 10 * 60_000;

/** After dropping spaces and the currency sign: `1500`, `99,5`, `99.50`. */
const AMOUNT_INPUT_RE = /^\d{1,9}(?:[.,]\d{1,2})?$/;

interface AmountPrompt {
  currency: Currency;
  chatId: number;
  messageId: number;
  until: number;
}

/**
 * The main UI (D21): /start sends a menu message, buttons edit it in place.
 * A tap is answered right away (stops the spinner), then the screen is replaced:
 * a purchase may take a few seconds.
 * "Custom amount" turns the menu into a prompt; the next text message is the amount.
 */
@Injectable()
export class MenuHandler implements BotHandler {
  private readonly logger = new Logger(MenuHandler.name);
  /** Waiting for a typed amount, by user id. In memory: a restart only drops the prompt. */
  private readonly prompts = new Map<string, AmountPrompt>();

  constructor(
    private readonly menu: MenuService,
    private readonly screens: WidgetScreensService,
    private readonly payments: PaymentMessagesService,
    private readonly topUps: TopUpService,
    private readonly users: UsersRepository,
    private readonly i18n: I18nService,
  ) {}

  register(bot: AppBot): void {
    bot.command('start', (ctx) => this.sendHome(ctx, true));
    bot.on('callback_query:data', (ctx, next) => this.onCallback(ctx, next));
    bot.on('message:text', (ctx, next) => this.onText(ctx, next));
  }

  /** Sends a new menu message with the home screen; `greet` adds the welcome line. */
  async sendHome(ctx: BotContext, greet = false): Promise<void> {
    if (!ctx.user) return;
    const view = await this.menu.view(
      await this.screens.home(ctx.user.id),
      ctx.locale,
      ctx.user.id,
    );
    const text = greet
      ? `${ctx.t('start', { name: ctx.user.firstName })}\n\n${view.text}`
      : view.text;
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: view.reply_markup,
      link_preview_options: { is_disabled: true },
    });
  }

  private async onCallback(ctx: BotContext, next: NextFunction): Promise<void> {
    const data = ctx.callbackQuery?.data ?? '';
    const isLanguage = data === LANGUAGE_SCREEN || data.startsWith(LANGUAGE_PREFIX);
    const customCurrency = data.startsWith(CUSTOM_AMOUNT_PREFIX)
      ? toCurrency(data.slice(CUSTOM_AMOUNT_PREFIX.length))
      : undefined;
    const cmd = isLanguage || customCurrency ? null : parseCommand(data);
    if (!isLanguage && !customCurrency && !cmd) return next();

    await ctx.answerCallbackQuery().catch(() => undefined);
    const message = ctx.callbackQuery?.message;
    if (!ctx.user || !message) return;
    const userId = ctx.user.id;
    // Any other button cancels a pending amount prompt.
    this.prompts.delete(userId);

    let view: MenuView;
    try {
      if (customCurrency) {
        const limits = this.topUps.limits(customCurrency);
        if (limits) {
          this.prune();
          this.prompts.set(userId, {
            currency: customCurrency,
            chatId: message.chat.id,
            messageId: message.message_id,
            until: Date.now() + AMOUNT_WAIT_MS,
          });
          view = this.menu.amountView(customCurrency, limits, ctx.locale);
        } else {
          view = await this.menu.view(await this.screens.topUp(userId), ctx.locale, userId);
        }
      } else if (data === LANGUAGE_SCREEN) {
        view = this.menu.languageView(ctx.locale);
      } else if (isLanguage) {
        await this.setLanguage(ctx, data.slice(LANGUAGE_PREFIX.length));
        view = await this.menu.view(await this.screens.home(userId), ctx.locale, userId);
      } else {
        let state: WidgetState;
        if (cmd!.c === 'invoice') {
          const target = {
            userId,
            chatId: message.chat.id,
            messageId: message.message_id,
            locale: ctx.locale,
          };
          state = await this.payments.sendInvoice(target, cmd!.currency, cmd!.amount);
        } else if (cmd!.c === 'link') {
          state = await this.screens.key(userId, cmd!.keyId);
        } else {
          state = await this.screens.execute(userId, cmd!);
        }
        view = await this.menu.view(state, ctx.locale, userId);
      }
    } catch (err) {
      this.logger.error(`Menu action ${data} failed for user ${userId}: ${String(err)}`);
      view = await this.menu.view(await this.screens.home(userId, 'err'), ctx.locale, userId);
    }
    await this.edit(ctx, message.chat.id, message.message_id, view);
  }

  /** A typed custom amount: invoice + the menu shows the result; a bad amount — a hint. */
  private async onText(ctx: BotContext, next: NextFunction): Promise<void> {
    const text = ctx.message?.text ?? '';
    const prompt = ctx.user ? this.prompts.get(ctx.user.id) : undefined;
    if (!ctx.user || !prompt || text.startsWith('/')) return next();
    if (prompt.until < Date.now() || ctx.chat?.id !== prompt.chatId) {
      this.prompts.delete(ctx.user.id);
      return next();
    }
    const userId = ctx.user.id;
    const limits = this.topUps.limits(prompt.currency);
    if (!limits) {
      this.prompts.delete(userId);
      return next();
    }

    const amount = parseAmount(text);
    if (!amount || amount.lt(limits.min) || amount.gt(limits.max)) {
      await ctx.reply(
        ctx.t('menu-topup-invalid', {
          min: money(limits.min, prompt.currency),
          max: money(limits.max, prompt.currency),
        }),
      );
      return;
    }

    this.prompts.delete(userId);
    let view: MenuView;
    try {
      const target = {
        userId,
        chatId: prompt.chatId,
        messageId: prompt.messageId,
        locale: ctx.locale,
      };
      const state = await this.payments.sendInvoice(target, prompt.currency, amount.toFixed());
      view = await this.menu.view(state, ctx.locale, userId);
    } catch (err) {
      this.logger.error(`Custom top-up failed for user ${userId}: ${String(err)}`);
      view = await this.menu.view(await this.screens.home(userId, 'err'), ctx.locale, userId);
    }
    await this.edit(ctx, prompt.chatId, prompt.messageId, view);
  }

  /** Drops expired prompts, so the map does not grow with users who never typed. */
  private prune(): void {
    const now = Date.now();
    for (const [id, p] of this.prompts) if (p.until < now) this.prompts.delete(id);
  }

  private async setLanguage(ctx: BotContext, code: string): Promise<void> {
    if (!this.i18n.isSupported(code) || !ctx.user) return;
    await this.users.setLanguage(ctx.user.telegramId, code);
    ctx.user.language = code;
    ctx.locale = code;
  }

  private async edit(
    ctx: BotContext,
    chatId: number,
    messageId: number,
    view: MenuView,
  ): Promise<void> {
    try {
      await ctx.api.editMessageText(chatId, messageId, view.text, {
        parse_mode: 'HTML',
        reply_markup: view.reply_markup,
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      // Tapping the same button twice leaves the text as is: not an error.
      if (String(err).includes('message is not modified')) return;
      this.logger.warn(`Menu edit failed: ${String(err)}`);
    }
  }
}

/** User input → amount with up to 2 decimals; spaces and the currency sign are allowed. */
function parseAmount(text: string): BigNumber | null {
  const clean = text.replace(/[\s\u00a0₽¥]|руб\.?|rub|cny|yuan|元/gi, '');
  if (!AMOUNT_INPUT_RE.test(clean)) return null;
  const value = new BigNumber(clean.replace(',', '.'));
  return value.gt(0) ? value : null;
}

function toCurrency(code: string): Currency | undefined {
  return (Object.values(Currency) as string[]).includes(code) ? (code as Currency) : undefined;
}
