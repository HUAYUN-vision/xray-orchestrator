import { Module } from '@nestjs/common';
import { Bot } from 'grammy';
import { AppConfigService } from '../config/app-config.service';
import type { BotHandler } from './bot-handler.interface';
import { CommandsHandler } from './handlers/commands.handler';
import { BOT, BOT_HANDLERS } from './telegram.constants';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';
import { WidgetApiService } from './widget-api.service';

@Module({
  controllers: [TelegramWebhookController],
  providers: [
    {
      provide: BOT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new Bot(config.get('BOT_TOKEN')),
    },
    CommandsHandler,
    {
      // New handlers: add the class to providers and to `inject` here.
      provide: BOT_HANDLERS,
      inject: [CommandsHandler],
      useFactory: (...handlers: BotHandler[]) => handlers,
    },
    TelegramService,
    WidgetApiService,
  ],
  exports: [BOT, WidgetApiService],
})
export class TelegramModule {}
