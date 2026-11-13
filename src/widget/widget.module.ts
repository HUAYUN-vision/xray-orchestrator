import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { I18nModule } from '../i18n/i18n.module';
import { KeysModule } from '../modules/keys/keys.module';
import { SubscriptionModule } from '../modules/subscription/subscription.module';
import { WidgetRendererService } from './widget-renderer.service';
import { WidgetScreensService } from './widget-screens.service';

/** Widget HTML (per locale) and screen state; sending and queries are in TelegramModule. */
@Module({
  imports: [DatabaseModule, I18nModule, KeysModule, SubscriptionModule],
  providers: [WidgetRendererService, WidgetScreensService],
  exports: [WidgetRendererService, WidgetScreensService],
})
export class WidgetModule {}
