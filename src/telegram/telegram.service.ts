import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { GrammyError, HttpError } from 'grammy';
import { AppConfigService } from '../config/app-config.service';
import type { AppBot } from './bot-context';
import type { BotHandler } from './bot-handler.interface';
import { ALLOWED_UPDATES, BOT, BOT_HANDLERS } from './telegram.constants';

type AllowedUpdates = NonNullable<Parameters<AppBot['api']['setWebhook']>[1]>['allowed_updates'];

/** Registers handlers and runs the bot in polling or webhook mode, tied to the Nest lifecycle. */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(BOT) private readonly bot: AppBot,
    @Inject(BOT_HANDLERS) private readonly handlers: BotHandler[],
    private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const handler of this.handlers) handler.register(this.bot);
    this.bot.catch((err) => this.logUpdateError(err.error, err.ctx.update.update_id));

    const allowedUpdates = ALLOWED_UPDATES as unknown as AllowedUpdates;

    // Not awaited: handler init (command menus) is cosmetic, and a slow Telegram API
    // must not block startup. Handlers catch their own errors; this is a safety net.
    void Promise.allSettled(this.handlers.map(async (h) => h.init?.(this.bot))).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') this.logger.warn(`Handler init failed: ${String(r.reason)}`);
      }
    });

    if (this.config.get('BOT_MODE') === 'webhook') {
      await this.bot.init();
      await this.bot.api.setWebhook(this.config.get('WEBHOOK_URL')!, {
        secret_token: this.config.get('WEBHOOK_SECRET'),
        allowed_updates: allowedUpdates,
      });
      this.logger.log(`Bot @${this.bot.botInfo.username} started (webhook)`);
      return;
    }

    // bot.start() resolves only when polling stops, so it must not be awaited.
    // It drops any webhook set earlier on its own.
    this.bot
      .start({
        allowed_updates: allowedUpdates,
        onStart: (me) => this.logger.log(`Bot @${me.username} started (polling)`),
      })
      .catch((err: unknown) => this.logger.error(`Polling stopped with an error: ${String(err)}`));
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.bot.isRunning()) await this.bot.stop();
  }

  private logUpdateError(error: unknown, updateId: number): void {
    if (error instanceof GrammyError) {
      this.logger.error(`Telegram API error on update ${updateId}: ${error.description}`);
    } else if (error instanceof HttpError) {
      this.logger.error(`Network error on update ${updateId}: ${String(error.error)}`);
    } else {
      this.logger.error(`Unhandled error on update ${updateId}`, error as Error);
    }
  }
}
