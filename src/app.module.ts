import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './modules/health/health.module';
import { KeysModule } from './modules/keys/keys.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
          autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    TelegramModule,
    SubscriptionModule,
    KeysModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
