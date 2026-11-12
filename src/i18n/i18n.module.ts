import { Module } from '@nestjs/common';
import { LOCALE_STORE } from './i18n.constants';
import { I18nService } from './i18n.service';
import { InMemoryLocaleStore } from './locale-store';

@Module({
  providers: [I18nService, { provide: LOCALE_STORE, useClass: InMemoryLocaleStore }],
  exports: [I18nService, LOCALE_STORE],
})
export class I18nModule {}
