import { createHmac } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Bot } from 'grammy';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import type { Env } from '../src/config/env.validation';
import { DatabaseModule } from '../src/database/database.module';
import { BalanceRepository } from '../src/database/repositories/balance.repository';
import { UsersRepository } from '../src/database/repositories/users.repository';
import { setupApp } from '../src/setup-app';
import type { BotContext } from '../src/telegram/bot-context';
import { BOT } from '../src/telegram/telegram.constants';
import { FakeDatabaseModule } from './helpers/fake-database.module';
import { InMemoryUsersRepository } from './helpers/in-memory-users.repository';
import { type ApiCall, makeOfflineBot } from './helpers/offline-bot';

const KEY = 'k'.repeat(32);
const DEP = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const env: Partial<Env> = {
  PAYMENTS_URL: 'http://payments.test',
  PAYMENTS_API_KEY: KEY,
  PUBLIC_URL: 'https://bot.test',
};

/** Callback from payments-service → raw-body HMAC check → deposit credited → user notified. */
describe('Payments callback (e2e)', () => {
  let app: INestApplication<App>;
  let bot: Bot<BotContext>;
  let calls: ApiCall[];
  let users: InMemoryUsersRepository;
  const completeDeposit = jest.fn();

  const sign = (ts: string, body: string) =>
    createHmac('sha256', KEY).update(`${ts}.${body}`).digest('hex');
  const post = (body: string, headers: Record<string, string>) =>
    request(app.getHttpServer())
      .post('/api/payments/callback')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);

  beforeAll(async () => {
    ({ bot, calls } = makeOfflineBot());
    users = new InMemoryUsersRepository();
    const user = await users.syncFromTelegram({
      telegramId: 42,
      firstName: 'Ann',
      lastName: null,
      username: null,
    } as never);

    completeDeposit.mockResolvedValue({
      applied: true,
      deposit: {
        id: DEP,
        userId: user.id,
        currency: 'rub',
        amount: '300.00000000',
        meta: { provider: 'yookassa', locale: 'en' },
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfigService)
      .useFactory({
        inject: [ConfigService],
        factory: (cs: ConfigService<Env, true>) => {
          const config = new AppConfigService(cs);
          const real = config.get.bind(config);
          config.get = ((key: keyof Env) => (key in env ? env[key] : real(key))) as never;
          return config;
        },
      })
      .overrideModule(DatabaseModule)
      .useModule(FakeDatabaseModule)
      .overrideProvider(BOT)
      .useValue(bot)
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(BalanceRepository)
      .useValue({
        findByUserId: () => Promise.resolve(null),
        findDeposit: () =>
          Promise.resolve({ id: DEP, userId: user.id, currency: 'rub', amount: '300.00000000' }),
        completeDeposit,
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const body = JSON.stringify({
    event: 'invoice.paid',
    invoice: {
      id: 'inv1',
      orderId: DEP,
      provider: 'yookassa',
      status: 'paid',
      amount: 300,
      currency: 'RUB',
      paymentUrl: 'https://pay.test/1',
    },
  });

  it('rejects an unsigned or tampered callback', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    await post(body, {}).expect(401);
    await post(body.replace('300', '3000'), {
      'X-Payments-Timestamp': ts,
      'X-Payments-Signature': sign(ts, body),
    }).expect(401);
    expect(completeDeposit).not.toHaveBeenCalled();
  });

  it('credits a signed callback and notifies the user', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    await post(body, { 'X-Payments-Timestamp': ts, 'X-Payments-Signature': sign(ts, body) }).expect(
      204,
    );
    expect(completeDeposit).toHaveBeenCalledWith(DEP, { paymentId: 'inv1' });
    const sent = calls.filter((c) => c.method === 'sendMessage');
    expect(sent).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ chat_id: 42, text: expect.stringContaining('300 ₽') }),
      }),
    ]);
  });
});
