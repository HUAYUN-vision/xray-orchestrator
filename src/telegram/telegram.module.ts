import { Module } from '@nestjs/common';
import { Bot } from 'grammy';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { I18nModule } from '../i18n/i18n.module';
import { WidgetModule } from '../widget/widget.module';
import type { BotContext } from './bot-context';
import type { BotHandler } from './bot-handler.interface';
import { CommandsHandler } from './handlers/commands.handler';
import { I18nMiddleware } from './handlers/i18n.middleware';
import { LanguageHandler } from './handlers/language.handler';
import { UserMiddleware } from './handlers/user.middleware';
import { WidgetHandler } from './handlers/widget.handler';
import { BOT, BOT_HANDLERS } from './telegram.constants';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';
import { WidgetApiService } from './widget-api.service';

@Module({
  imports: [DatabaseModule, I18nModule, WidgetModule],
  controllers: [TelegramWebhookController],
  providers: [
    {
      provide: BOT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new Bot<BotContext>(config.get('BOT_TOKEN')),
    },
    UserMiddleware,
    I18nMiddleware,
    CommandsHandler,
    LanguageHandler,
    WidgetHandler,
    {
      // Order matters: middleware runs in this order. UserMiddleware → I18nMiddleware first.
      // New handlers: add the class to providers and to `inject` here.
      provide: BOT_HANDLERS,
      inject: [UserMiddleware, I18nMiddleware, CommandsHandler, LanguageHandler, WidgetHandler],
      useFactory: (...handlers: BotHandler[]) => handlers,
    },
    TelegramService,
    WidgetApiService,
  ],
  exports: [BOT, WidgetApiService],
})
export class TelegramModule {}
