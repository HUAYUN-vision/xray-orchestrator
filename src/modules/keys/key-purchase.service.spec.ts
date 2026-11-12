import { Logger } from '@nestjs/common';
import { InsufficientFundsError } from '../../database/balance-ops';
import type { Tariff, Transaction, UserKey } from '../../database/entities';
import { Currency } from '../../database/enums';
import type { ServerWithKey } from '../../database/repositories/servers.repository';
import type { NewUserKey } from '../../database/repositories/user-keys.repository';
import { XrayNodeError } from '../xray/xray-node.client';
import { KeyPurchaseError, KeyPurchaseService } from './key-purchase.service';

const tariff = {
  id: 't1',
  durationDays: 30,
  price: '199.00000000',
  currency: Currency.RUB,
  trafficLimit: null,
  active: true,
} as Tariff;
const server = (code: string) => ({ id: code, code, host: `${code}.example.com` }) as ServerWithKey;
const paymentTx = { id: 'tx1', userId: 1, amount: '199.00000000', currency: Currency.RUB };

describe('KeyPurchaseService', () => {
  let deps: {
    tariffs: { findActiveById: jest.Mock };
    servers: { findEnabled: jest.Mock };
    keys: { createPaid: jest.Mock; cancelPaid: jest.Mock };
    rates: { convert: jest.Mock };
    xray: { addClient: jest.Mock };
    subscription: { buildUrl: jest.Mock };
  };
  let service: KeyPurchaseService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    deps = {
      tariffs: { findActiveById: jest.fn().mockResolvedValue(tariff) },
      servers: { findEnabled: jest.fn().mockResolvedValue([server('nl'), server('de')]) },
      keys: {
        createPaid: jest.fn((key: NewUserKey, payment: unknown) =>
          Promise.resolve({
            key: key as UserKey,
            payment: payment ? (paymentTx as Transaction) : null,
          }),
        ),
        cancelPaid: jest.fn().mockResolvedValue(true),
      },
      rates: {
        convert: jest
          .fn()
          .mockResolvedValue({ amount: '16.06043243', rate: '0.080705', ratesDate: 'd' }),
      },
      xray: { addClient: jest.fn().mockResolvedValue(undefined) },
      subscription: { buildUrl: jest.fn((id: string) => `https://x.test/api/sub/${id}`) },
    };
    service = new KeyPurchaseService(
      deps.tariffs as never,
      deps.servers as never,
      deps.keys as never,
      deps.rates as never,
      deps.xray as never,
      deps.subscription as never,
    );
  });

  const buy = (currency = Currency.RUB) =>
    service.purchase({ userId: 1, tariffId: 't1', currency, expectedSeqno: 5 });

  it('charges the tariff price, creates the key on every server and returns the subscription', async () => {
    const res = await buy();

    const [key, payment] = deps.keys.createPaid.mock.calls[0] as [NewUserKey, unknown];
    expect(payment).toEqual({ currency: Currency.RUB, amount: '199.00000000', expectedSeqno: 5 });
    expect(key.userId).toBe(1);
    expect(key.expiresAt.getTime() - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
    expect(deps.xray.addClient).toHaveBeenCalledTimes(2);
    expect(deps.rates.convert).not.toHaveBeenCalled();
    expect(res.subscriptionUrl).toBe(`https://x.test/api/sub/${key.id}`);
    expect(res.failedServers).toEqual([]);
  });

  it('converts the price, rounding up, when paying from another balance', async () => {
    await buy(Currency.CNY);
    expect(deps.rates.convert).toHaveBeenCalledWith(
      '199.00000000',
      Currency.RUB,
      Currency.CNY,
      'up',
    );
    expect(deps.keys.createPaid.mock.calls[0][1]).toEqual({
      currency: Currency.CNY,
      amount: '16.06043243',
      expectedSeqno: 5,
      price: { amount: '199.00000000', currency: Currency.RUB, rate: '0.080705' },
    });
  });

  it('does not charge for a free tariff', async () => {
    deps.tariffs.findActiveById.mockResolvedValue({ ...tariff, price: '0.00000000' });
    const res = await buy(Currency.CNY);
    expect(deps.keys.createPaid.mock.calls[0][1]).toBeNull();
    expect(res.payment).toBeNull();
  });

  it('succeeds if at least one server accepted the key', async () => {
    deps.xray.addClient
      .mockRejectedValueOnce(new XrayNodeError('nl', 'timeout', 'x'))
      .mockResolvedValueOnce(undefined);
    const res = await buy();
    expect(res.failedServers).toEqual(['nl']);
    expect(deps.keys.cancelPaid).not.toHaveBeenCalled();
  });

  it('refunds and fails if no server accepted the key', async () => {
    deps.xray.addClient.mockRejectedValue(new XrayNodeError('nl', 'unreachable', 'x'));
    await expect(buy()).rejects.toMatchObject({ reason: 'creation_failed' });
    const [keyId, payment, reason] = deps.keys.cancelPaid.mock.calls[0] as unknown[];
    expect(keyId).toBe((deps.keys.createPaid.mock.calls[0][0] as NewUserKey).id);
    expect(payment).toBe(paymentTx);
    expect(reason).toBe('creation_failed');
  });

  it.each([
    ['tariff_not_found', () => deps.tariffs.findActiveById.mockResolvedValue(null)],
    ['no_servers', () => deps.servers.findEnabled.mockResolvedValue([])],
  ])('fails with %s before charging', async (reason, arrange) => {
    arrange();
    await expect(buy()).rejects.toEqual(expect.any(KeyPurchaseError));
    await expect(buy()).rejects.toMatchObject({ reason });
    expect(deps.keys.createPaid).not.toHaveBeenCalled();
  });

  it('does not charge when PUBLIC_URL is missing', async () => {
    deps.subscription.buildUrl.mockImplementation(() => {
      throw new Error('PUBLIC_URL is not set');
    });
    await expect(buy()).rejects.toThrow(/PUBLIC_URL/);
    expect(deps.keys.createPaid).not.toHaveBeenCalled();
  });

  it('does not touch servers when the balance is too low', async () => {
    deps.keys.createPaid.mockRejectedValue(
      new InsufficientFundsError(Currency.RUB, '199', '10.00000000'),
    );
    await expect(buy()).rejects.toThrow(InsufficientFundsError);
    expect(deps.xray.addClient).not.toHaveBeenCalled();
  });
});
