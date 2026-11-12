import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Bot } from 'grammy';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import type { BotContext } from '../src/telegram/bot-context';
import { DatabaseModule } from '../src/database/database.module';
import { BOT } from '../src/telegram/telegram.constants';
import { FakeDatabaseModule } from './helpers/fake-database.module';
import { type ApiCall, makeOfflineBot, textUpdate } from './helpers/offline-bot';

describe('Telegram (e2e)', () => {
  let app: INestApplication<App>;
  let bot: Bot<BotContext>;
  let calls: ApiCall[];

  const sentTexts = () =>
    calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload.text as string);

  beforeAll(async () => {
    ({ bot, calls } = makeOfflineBot());
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule(FakeDatabaseModule)
      .overrideProvider(BOT)
      .useValue(bot)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('on bootstrap sets the localized menu and starts polling', () => {
    expect(calls.filter((c) => c.method === 'setMyCommands')).toHaveLength(3);
    expect(bot.start).toHaveBeenCalled();
  });

  describe('updates', () => {
    beforeEach(() => {
      calls.length = 0;
    });

    it('answers /start in the default language', async () => {
      await bot.handleUpdate(textUpdate('/start'));
      expect(sentTexts()).toEqual([expect.stringContaining('Привет')]);
    });

    it('uses Telegram language_code when nothing is saved', async () => {
      await bot.handleUpdate(textUpdate('/start', { id: 7, language_code: 'en-US' }));
      expect(sentTexts()).toEqual([expect.stringContaining('Hi')]);
    });

    it('/language <code> switches the language for later messages', async () => {
      const user = { id: 100, language_code: 'ru' };
      await bot.handleUpdate(textUpdate('/language en', user, 2));
      await bot.handleUpdate(textUpdate('/help', user, 3));
      expect(sentTexts()).toEqual([
        expect.stringContaining('Language switched to English'),
        expect.stringContaining('Commands:'),
      ]);
    });
  });

  it('webhook endpoint is disabled in polling mode', () => {
    return request(app.getHttpServer()).post('/api/telegram/webhook').send({}).expect(404);
  });
});
