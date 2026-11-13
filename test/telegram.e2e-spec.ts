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

    const widgets = () => calls.filter((c) => c.method === 'sendWidget').map((c) => c.payload);

    it('/start sends the widget in the default language', async () => {
      await bot.handleUpdate(textUpdate('/start'));
      const [w] = widgets();
      expect(w).toMatchObject({ chat_id: 42, allow_queries: true });
      expect(w.caption).toContain('Привет');
      expect(w.html).toContain('Купить ключ');
      expect(JSON.parse(w.chat_data as string)).toMatchObject({ s: 'h', k: [] });
    });

    it('uses Telegram language_code when nothing is saved', async () => {
      await bot.handleUpdate(textUpdate('/start', { id: 7, language_code: 'en-US' }));
      expect(widgets()[0].html).toContain('Buy a key');
    });

    it('a widget query is answered and the widget state is replaced', async () => {
      await bot.handleUpdate({
        update_id: 50,
        widget_query: {
          id: 'wq1',
          from: { id: 42, is_bot: false, first_name: 'U' },
          data: 'b',
          chat: { id: 42, type: 'private', first_name: 'U' },
          message_id: 9,
        },
      } as never);
      expect(calls.map((c) => c.method)).toEqual(['answerWidgetQuery', 'editMessageWidgetData']);
      expect(calls[0].payload).toMatchObject({ widget_query_id: 'wq1', data: 'ok' });
      expect(JSON.parse(calls[1].payload.chat_data as string)).toMatchObject({ s: 'b', t: [] });
    });

    it('/language <code> switches the language for later messages', async () => {
      const user = { id: 100, language_code: 'ru' };
      await bot.handleUpdate(textUpdate('/language en', user, 2));
      await bot.handleUpdate(textUpdate('/help', user, 3));
      expect(sentTexts()).toEqual([
        expect.stringContaining('Language switched to English'),
        expect.stringContaining('Commands:'),
      ]);
      // A new widget in the new language follows the switch.
      expect(widgets()[0].html).toContain('Buy a key');
    });
  });

  it('subscription: 400 for a malformed key id, 404 for an unknown key', async () => {
    await request(app.getHttpServer()).get('/api/sub/not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .get('/api/sub/0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f')
      .expect(404);
  });

  it('webhook endpoint is disabled in polling mode', () => {
    return request(app.getHttpServer()).post('/api/telegram/webhook').send({}).expect(404);
  });
});
