import { Logger } from '@nestjs/common';
import { InsufficientFundsError, StaleBalanceError } from '../database/balance-ops';
import { Currency, UserKeyStatus } from '../database/enums';
import { KeyPurchaseError } from '../modules/keys/key-purchase.service';
import { RatesUnavailableError } from '../modules/rates/exchange-rates.service';
import { WidgetScreensService } from './widget-screens.service';
import type { WidgetCommand } from './widget-state';

const T = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const U = '00000000-0000-4000-8000-000000000001';
const K = '11111111-1111-4111-8111-111111111111';
const future = new Date(Date.now() + 86_400_000);
const tariff = { id: T, durationDays: 30, price: '199.00000000', currency: Currency.RUB };
const account = { userId: U, rub: '500.12999999', cny: '0.00000000', usdt: '3.5', seqno: 7 };
const key = { id: K, userId: U, status: UserKeyStatus.Active, expiresAt: future };

describe('WidgetScreensService', () => {
  let deps: Record<string, Record<string, jest.Mock>>;
  let service: WidgetScreensService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    deps = {
      balances: { findByUserId: jest.fn().mockResolvedValue(account) },
      tariffs: {
        findActive: jest.fn().mockResolvedValue([tariff]),
        findActiveById: jest.fn().mockResolvedValue(tariff),
      },
      keys: {
        findByUser: jest.fn().mockResolvedValue([key]),
        findOwned: jest.fn().mockResolvedValue(key),
      },
      purchase: {
        quote: jest.fn().mockResolvedValue([
          { currency: Currency.RUB, amount: '199.00' },
          { currency: Currency.USDT, amount: '2.41', rate: '0.01' },
        ]),
        purchase: jest.fn().mockResolvedValue({ key }),
      },
      subscription: { buildUrl: jest.fn((id: string) => `https://x.test/api/sub/${id}`) },
    };
    service = new WidgetScreensService(
      deps.balances as never,
      deps.tariffs as never,
      deps.keys as never,
      deps.purchase as never,
      deps.subscription as never,
    );
  });

  const run = (cmd: WidgetCommand) => service.execute(U, cmd);
  const buy: WidgetCommand = {
    c: 'buy',
    tariffId: T,
    currency: Currency.RUB,
    seqno: 7,
    amount: '199.00',
  };

  it('home: balances rounded down to 2 decimals and keys', async () => {
    const state = await run({ c: 'home' });
    expect(state).toMatchObject({
      s: 'h',
      b: { rub: '500.12', cny: '0.00', usdt: '3.50' },
      k: [[K, Math.floor(future.getTime() / 1000), 1]],
    });
    expect(state.m).toBeUndefined();
  });

  it('tariffs and pay screens', async () => {
    await expect(run({ c: 'tariffs' })).resolves.toMatchObject({
      s: 'b',
      t: [[T, 30, '199', Currency.RUB]],
    });
    await expect(run({ c: 'pay', tariffId: T })).resolves.toMatchObject({
      s: 't',
      i: T,
      d: 30,
      q: 7,
      o: [
        [Currency.RUB, '199.00'],
        [Currency.USDT, '2.41'],
      ],
    });
  });

  it('key screen flags the link without putting it in chat_data; a foreign key goes home with "gone"', async () => {
    await expect(run({ c: 'key', keyId: K })).resolves.toMatchObject({ s: 'k', a: 1, u: 1 });
    deps.keys.findOwned.mockResolvedValue(null);
    await expect(run({ c: 'key', keyId: K })).resolves.toMatchObject({ s: 'h', m: 'gone' });
  });

  it('expired key has no subscription URL', async () => {
    deps.keys.findOwned.mockResolvedValue({ ...key, status: UserKeyStatus.Expired });
    const state = await run({ c: 'key', keyId: K });
    expect(state).toMatchObject({ s: 'k', a: 0 });
    expect(state).not.toHaveProperty('u', expect.anything());
  });

  it('no link flag when PUBLIC_URL is not set', async () => {
    deps.subscription.buildUrl.mockImplementation(() => {
      throw new Error('PUBLIC_URL is not set');
    });
    const state = await run({ c: 'key', keyId: K });
    expect(state).toMatchObject({ s: 'k', a: 1 });
    expect(state).not.toHaveProperty('u', expect.anything());
  });

  it('subscriptionUrl: only for an own active key', async () => {
    await expect(service.subscriptionUrl(U, K)).resolves.toBe(`https://x.test/api/sub/${K}`);
    deps.keys.findOwned.mockResolvedValue({ ...key, status: UserKeyStatus.Expired });
    await expect(service.subscriptionUrl(U, K)).resolves.toBeNull();
    deps.keys.findOwned.mockResolvedValue(null);
    await expect(service.subscriptionUrl(U, K)).resolves.toBeNull();
  });

  it('buy: passes seqno and the shown amount, shows the new key', async () => {
    await expect(run(buy)).resolves.toMatchObject({ s: 'k', i: K, m: 'ok' });
    expect(deps.purchase.purchase).toHaveBeenCalledWith({
      userId: U,
      tariffId: T,
      currency: Currency.RUB,
      expectedSeqno: 7,
      expectedAmount: '199.00',
    });
  });

  it.each([
    [new InsufficientFundsError(Currency.RUB, '199', '1'), 't', 'funds'],
    [new StaleBalanceError(7, 8), 't', 'stale'],
    [new RatesUnavailableError('x'), 't', 'rates'],
    [new KeyPurchaseError('price_changed'), 't', 'price'],
    [new KeyPurchaseError('no_servers'), 't', 'srv'],
    [new KeyPurchaseError('creation_failed'), 't', 'fail'],
    [new KeyPurchaseError('tariff_not_found'), 'b', 'tariff'],
    [new Error('bug'), 'h', 'err'],
  ])('buy failure %p → screen %s with message %s', async (err, screen, m) => {
    deps.purchase.purchase.mockRejectedValue(err);
    await expect(run(buy)).resolves.toMatchObject({ s: screen, m });
  });

  it('state of a full home screen fits chat_data (1 KB)', async () => {
    deps.keys.findByUser.mockResolvedValue(Array.from({ length: 6 }, () => key));
    deps.balances.findByUserId.mockResolvedValue({
      ...account,
      rub: '999999999999.99',
      cny: '999999999999.99',
      usdt: '999999999999.99',
    });
    const state = await run({ c: 'home' });
    expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(1024);
  });
});
