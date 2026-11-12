import { Module } from '@nestjs/common';
import { Bot } from 'grammy';
import { AppConfigService } from '../config/app-config.service';
import { I18nModule } from '../i18n/i18n.module';
import type { BotContext } from './bot-context';
import type { BotHandler } from './bot-handler.interface';
import { CommandsHandler } from './handlers/commands.handler';
import { I18nMiddleware } from './handlers/i18n.middleware';
import { LanguageHandler } from './handlers/language.handler';
import { BOT, BOT_HANDLERS } from './telegram.constants';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';
import { WidgetApiService } from './widget-api.service';

@Module({
  imports: [I18nModule],
  controllers: [TelegramWebhookController],
  providers: [
    {
      provide: BOT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new Bot<BotContext>(config.get('BOT_TOKEN')),
    },
    I18nMiddleware,
    CommandsHandler,
    LanguageHandler,
    {
      // Order matters: middleware runs in this order. I18nMiddleware must stay first.
      // New handlers: add the class to providers and to `inject` here.
      provide: BOT_HANDLERS,
      inject: [I18nMiddleware, CommandsHandler, LanguageHandler],
      useFactory: (...handlers: BotHandler[]) => handlers,
    },
    TelegramService,
    WidgetApiService,
  ],
  exports: [BOT, WidgetApiService],
})
export class TelegramModule {}
