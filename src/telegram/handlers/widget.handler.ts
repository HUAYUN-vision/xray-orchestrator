import { Injectable, Logger } from '@nestjs/common';
import type { NextFunction } from 'grammy';
import { WidgetRendererService } from '../../widget/widget-renderer.service';
import { WidgetScreensService } from '../../widget/widget-screens.service';
import { parseCommand } from '../../widget/widget-state';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import type { WidgetQuery } from '../types/widget';
import { WidgetApiService } from '../widget-api.service';
import { getWidgetQuery } from '../widget-query';

/**
 * The main UI: /start sends the widget, taps in it arrive as `widget_query`.
 * A query is answered right away ("ok"), then the new screen is set via editMessageWidgetData:
 * a purchase may take longer than the 15 s answer limit.
 */
@Injectable()
export class WidgetHandler implements BotHandler {
  private readonly logger = new Logger(WidgetHandler.name);

  constructor(
    private readonly api: WidgetApiService,
    private readonly renderer: WidgetRendererService,
    private readonly screens: WidgetScreensService,
  ) {}

  register(bot: AppBot): void {
    bot.command('start', (ctx) => this.sendHome(ctx));
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

    const state = await this.screens.execute(ctx.user.id, cmd);
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
}
