import { Logger } from '@nestjs/common';
import type { AppBot } from './bot-context';
import type { AppConfigService } from '../config/app-config.service';
import type { Env } from '../config/env.validation';
import type { BotHandler } from './bot-handler.interface';
import { TelegramService } from './telegram.service';

function makeBot() {
  return {
    catch: jest.fn(),
    init: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(true),
    botInfo: { username: 'test_bot' },
    api: { setWebhook: jest.fn().mockResolvedValue(true) },
  };
}

function makeConfig(env: Partial<Env>): AppConfigService {
  return { get: (key: keyof Env) => env[key] } as AppConfigService;
}

describe('TelegramService', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('registers handlers and starts polling without awaiting it', async () => {
    const bot = makeBot();
    const handler: BotHandler = { register: jest.fn() };
    const service = new TelegramService(
      bot as unknown as AppBot,
      [handler],
      makeConfig({ BOT_MODE: 'polling' }),
    );

    await service.onApplicationBootstrap();

    expect(handler.register).toHaveBeenCalledWith(bot);
    expect(bot.catch).toHaveBeenCalled();
    expect(bot.start).toHaveBeenCalledWith(
      expect.objectContaining({ allowed_updates: expect.arrayContaining(['widget_query']) }),
    );
    expect(bot.api.setWebhook).not.toHaveBeenCalled();
  });

  it('sets the webhook with the secret in webhook mode', async () => {
    const bot = makeBot();
    const service = new TelegramService(
      bot as unknown as AppBot,
      [],
      makeConfig({
        BOT_MODE: 'webhook',
        WEBHOOK_URL: 'https://bot.example.com/api/telegram/webhook',
        WEBHOOK_SECRET: 'secret',
      }),
    );

    await service.onApplicationBootstrap();

    expect(bot.init).toHaveBeenCalled();
    expect(bot.api.setWebhook).toHaveBeenCalledWith(
      'https://bot.example.com/api/telegram/webhook',
      expect.objectContaining({ secret_token: 'secret' }),
    );
    expect(bot.start).not.toHaveBeenCalled();
  });

  it('stops polling on shutdown', async () => {
    const bot = makeBot();
    const service = new TelegramService(bot as unknown as AppBot, [], makeConfig({}));
    await service.onApplicationShutdown();
    expect(bot.stop).toHaveBeenCalled();
  });
});
