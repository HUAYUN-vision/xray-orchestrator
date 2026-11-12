import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Bot } from 'grammy';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { BOT } from '../src/telegram/telegram.constants';
import { makeOfflineBot } from './helpers/offline-bot';

describe('Telegram (e2e)', () => {
  let app: INestApplication<App>;
  let bot: Bot;

  beforeAll(async () => {
    bot = makeOfflineBot();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

  it('starts the bot in polling mode on bootstrap', () => {
    expect(bot.start).toHaveBeenCalled();
  });

  it('answers /start through the registered handlers', async () => {
    // Transformers must return the raw API envelope { ok, result }.
    const sendMessage = jest.fn().mockResolvedValue({ ok: true, result: {} });
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') return sendMessage(payload) as never;
      return prev(method, payload, signal);
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 42, type: 'private', first_name: 'U' },
        from: { id: 42, is_bot: false, first_name: 'U' },
        text: '/start',
        entities: [{ type: 'bot_command', offset: 0, length: 6 }],
      },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: 42, text: expect.stringContaining('/help') }),
    );
  });

  it('webhook endpoint is disabled in polling mode', () => {
    return request(app.getHttpServer()).post('/api/telegram/webhook').send({}).expect(404);
  });
});
