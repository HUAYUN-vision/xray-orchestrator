import { Injectable, Logger } from '@nestjs/common';
import type { NextFunction } from 'grammy';
import { WidgetRendererService } from '../../widget/widget-renderer.service';
import { WidgetScreensService } from '../../widget/widget-screens.service';
import { parseCommand, type WidgetState } from '../../widget/widget-state';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { PaymentMessagesService } from '../payment-messages.service';
import type { WidgetQuery } from '../types/widget';
import { WidgetApiService } from '../widget-api.service';
import { getWidgetQuery } from '../widget-query';

/**
 * HTML widget UI — on hold (D21): Telegram answers sendWidget with INPUT_MEDIA_WIDGET_NOT_ALLOWED,
 * so /start sends the button menu (MenuHandler). Queries of already sent widgets are still served.
 * Taps in a widget arrive as `widget_query`.
 * A query is answered right away ("ok"), then the new screen is set via editMessageWidgetData:
 * a purchase may take longer than the 15 s answer limit.
 *
 * The subscription link is sent as a regular message with a copy button: Telegram protects
 * widget messages, so copyText is blocked inside the widget (D17).
 */
@Injectable()
export class WidgetHandler implements BotHandler {
  private readonly logger = new Logger(WidgetHandler.name);

  constructor(
    private readonly api: WidgetApiService,
    private readonly renderer: WidgetRendererService,
    private readonly screens: WidgetScreensService,
    private readonly payments: PaymentMessagesService,
  ) {}

  register(bot: AppBot): void {
    bot.use((ctx, next) => this.onQuery(ctx, next));
  }

  /** Sends a new widget with the home screen in the user's language. */
  async sendHome(ctx: BotContext): Promise<void> {
    if (!ctx.user || !ctx.chat) return;
    const state = await this.screens.home(ctx.user.id);
    await this.api.sendWidget({
      chat_id: ctx.chat.id,
      html: this.renderer.render(ctx.locale).html,
      caption: ctx.t('start', { name: ctx.user.firstName }),
      allow_queries: true,
      chat_data: JSON.stringify(state),
    });
  }

  private async onQuery(ctx: BotContext, next: NextFunction): Promise<void> {
    const query = getWidgetQuery(ctx);
    if (!query) return next();
    await this.handleQuery(ctx, query);
  }

  async handleQuery(ctx: BotContext, query: WidgetQuery): Promise<void> {
    const cmd = parseCommand(query.data);
    await this.api.answerWidgetQuery({ widget_query_id: query.id, data: cmd ? 'ok' : 'bad' });
    if (!cmd || !ctx.user || query.chat === undefined || query.message_id === undefined) return;

    let state: WidgetState;
    if (cmd.c === 'link') {
      state = await this.sendLink(ctx, query.chat.id, ctx.user.id, cmd.keyId);
    } else if (cmd.c === 'invoice') {
      const target = {
        userId: ctx.user.id,
        chatId: query.chat.id,
        messageId: query.message_id,
        locale: ctx.locale,
      };
      state = await this.payments.sendInvoice(target, cmd.currency, cmd.amount);
    } else {
      state = await this.screens.execute(ctx.user.id, cmd);
    }
    try {
      await this.api.editMessageWidgetData({
        chat_id: query.chat.id,
        message_id: query.message_id,
        chat_data: JSON.stringify(state),
      });
    } catch (err) {
      this.logger.error(`editMessageWidgetData failed: ${String(err)}`);
    }
  }

  /** Sends the subscription link and returns the key screen with the result. */
  private async sendLink(
    ctx: BotContext,
    chatId: number,
    userId: string,
    keyId: string,
  ): Promise<WidgetState> {
    try {
      const url = await this.screens.subscriptionUrl(userId, keyId);
      if (!url) return await this.screens.execute(userId, { c: 'key', keyId });
      await ctx.api.sendMessage(chatId, `${ctx.t('sub-link')}\n\n<code>${url}</code>`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: ctx.t('sub-copy'), copy_text: { text: url } }]],
        },
      });
      return await this.screens.key(userId, keyId, 'link');
    } catch (err) {
      this.logger.error(`Sending subscription link failed for user ${userId}: ${String(err)}`);
      return this.screens.key(userId, keyId, 'err');
    }
  }
}
