import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import { Currency, TransactionStatus } from '../../database/enums';
import { PaymentsError } from './payments.client';
import { TopUpError, TopUpService } from './top-up.service';

const DEP = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const env: Record<string, unknown> = {
  PUBLIC_URL: 'https://bot.test',
  GLOBAL_PREFIX: 'api',
  TOPUP_PRESETS_RUB: ['100', '300'],
  TOPUP_PRESETS_CNY: ['10'],
  TOPUP_MIN_RUB: '100',
  TOPUP_MAX_RUB: '100000',
  TOPUP_MIN_CNY: '10',
  TOPUP_MAX_CNY: '10000',
};
const config = { get: (k: string) => env[k] } as unknown as AppConfigService;

const deposit = (over: object = {}) => ({
  id: DEP,
  userId: 'u1',
  currency: Currency.RUB,
  amount: '300.00000000',
  status: TransactionStatus.Pending,
  meta: { provider: 'yookassa', messageId: 10, locale: 'en' },
  ...over,
});
const invoice = (over: object = {}) => ({
  id: 'inv1',
  orderId: DEP,
  provider: 'yookassa',
  status: 'paid',
  amount: 300,
  currency: 'RUB',
  paymentUrl: 'https://pay.test/1',
  ...over,
});

describe('TopUpService', () => {
  let client: { enabled: boolean; createInvoice: jest.Mock };
  let balances: Record<string, jest.Mock>;
  let service: TopUpService;
  const req = {
    userId: 'u1',
    currency: Currency.RUB,
    amount: '300',
    description: 'Top-up',
    returnUrl: 'https://t.me/test_bot',
  };

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    client = {
      enabled: true,
      createInvoice: jest.fn().mockResolvedValue(invoice({ status: 'pending' })),
    };
    balances = {
      findReusableDeposit: jest.fn().mockResolvedValue(null),
      createDeposit: jest.fn().mockResolvedValue(deposit()),
      updateDepositMeta: jest.fn().mockResolvedValue(undefined),
      failDeposit: jest.fn().mockResolvedValue({ deposit: deposit(), applied: true }),
      findDeposit: jest.fn().mockResolvedValue(deposit()),
      completeDeposit: jest.fn().mockResolvedValue({
        deposit: deposit({ status: TransactionStatus.Completed }),
        applied: true,
      }),
    };
    service = new TopUpService(config, client as never, balances as never);
  });

  it('presets: configured currencies; none when payments are off', () => {
    expect(service.presets()).toEqual([
      [Currency.RUB, ['100', '300']],
      [Currency.CNY, ['10']],
    ]);
    client.enabled = false;
    expect(service.presets()).toEqual([]);
  });

  describe('create', () => {
    it('pending deposit → invoice with orderId = deposit id → link saved', async () => {
      const res = await service.create({ ...req, messageId: 10, locale: 'en' });
      expect(balances.createDeposit).toHaveBeenCalledWith({
        userId: 'u1',
        currency: Currency.RUB,
        amount: '300',
        meta: { provider: 'yookassa', messageId: 10, locale: 'en' },
      });
      expect(client.createInvoice).toHaveBeenCalledWith({
        orderId: DEP,
        provider: 'yookassa',
        amount: 300,
        description: 'Top-up',
        callbackUrl: 'https://bot.test/api/payments/callback',
        returnUrl: 'https://t.me/test_bot',
      });
      expect(balances.updateDepositMeta).toHaveBeenCalledWith(DEP, {
        paymentId: 'inv1',
        paymentUrl: 'https://pay.test/1',
      });
      expect(res).toEqual({
        depositId: DEP,
        provider: 'yookassa',
        currency: Currency.RUB,
        amount: '300',
        paymentUrl: 'https://pay.test/1',
      });
    });

    it('CNY goes to WeChat, without returnUrl', async () => {
      await service.create({ ...req, currency: Currency.CNY, amount: '10' });
      expect(client.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'wechat', amount: 10 }),
      );
      expect(client.createInvoice.mock.calls[0][0]).not.toHaveProperty('returnUrl');
    });

    it('custom amount within the limits is accepted and normalized', async () => {
      const res = await service.create({ ...req, amount: '1500.50' });
      expect(client.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'yookassa', amount: 1500.5 }),
      );
      expect(res.amount).toBe('1500.5');
    });

    it('limits: per offered currency; none for USDT or with payments off', () => {
      expect(service.limits(Currency.RUB)).toEqual({ min: '100', max: '100000' });
      expect(service.limits(Currency.CNY)).toEqual({ min: '10', max: '10000' });
      expect(service.limits(Currency.USDT)).toBeNull();
      client.enabled = false;
      expect(service.limits(Currency.RUB)).toBeNull();
    });

    it('out-of-range amounts and unsupported currencies are rejected', async () => {
      for (const amount of ['99', '100001', '150.555', 'abc']) {
        await expect(service.create({ ...req, amount })).rejects.toMatchObject({
          reason: 'amount',
        });
      }
      await expect(
        service.create({ ...req, currency: Currency.USDT, amount: '10' }),
      ).rejects.toBeInstanceOf(TopUpError);
      expect(balances.createDeposit).not.toHaveBeenCalled();
    });

    it('payments off → disabled', async () => {
      client.enabled = false;
      await expect(service.create(req)).rejects.toMatchObject({ reason: 'disabled' });
    });

    it('a repeated tap reuses the recent unpaid invoice', async () => {
      balances.findReusableDeposit.mockResolvedValue(
        deposit({ meta: { provider: 'yookassa', paymentUrl: 'https://pay.test/old' } }),
      );
      const res = await service.create(req);
      expect(res.paymentUrl).toBe('https://pay.test/old');
      expect(res.amount).toBe('300');
      expect(client.createInvoice).not.toHaveBeenCalled();
    });

    it('provider error → deposit failed, TopUpError', async () => {
      client.createInvoice.mockRejectedValue(new PaymentsError('rejected', '400'));
      await expect(service.create(req)).rejects.toMatchObject({ reason: 'provider' });
      expect(balances.failDeposit).toHaveBeenCalledWith(DEP);
    });
  });

  describe('handleCallback', () => {
    let paid: jest.Mock;

    beforeEach(() => {
      paid = jest.fn();
      service.onPaid(paid);
    });

    it('paid: credits the deposit and notifies once', async () => {
      await service.handleCallback({ event: 'invoice.paid', invoice: invoice() as never });
      expect(balances.completeDeposit).toHaveBeenCalledWith(DEP, { paymentId: 'inv1' });
      expect(paid).toHaveBeenCalledWith({
        userId: 'u1',
        currency: Currency.RUB,
        amount: '300',
        meta: { provider: 'yookassa', messageId: 10, locale: 'en' },
      });
    });

    it('a repeated callback changes nothing and does not notify', async () => {
      balances.completeDeposit.mockResolvedValue({ deposit: deposit(), applied: false });
      await service.handleCallback({ event: 'invoice.paid', invoice: invoice() as never });
      expect(paid).not.toHaveBeenCalled();
    });

    it.each([
      ['amount', { amount: 3000 }],
      ['currency', { currency: 'CNY' }],
      ['provider', { provider: 'wechat' }],
    ])('never credits a mismatched %s', async (_name, over) => {
      await service.handleCallback({ event: 'invoice.paid', invoice: invoice(over) as never });
      expect(balances.completeDeposit).not.toHaveBeenCalled();
    });

    it('unknown order or deposit is acknowledged and ignored', async () => {
      await service.handleCallback({
        event: 'invoice.paid',
        invoice: invoice({ orderId: 'order-42' }) as never,
      });
      balances.findDeposit.mockResolvedValue(null);
      await service.handleCallback({ event: 'invoice.paid', invoice: invoice() as never });
      expect(balances.completeDeposit).not.toHaveBeenCalled();
    });

    it('canceled: the deposit fails, nothing is credited', async () => {
      await service.handleCallback({
        event: 'invoice.canceled',
        invoice: invoice({ status: 'canceled' }) as never,
      });
      expect(balances.failDeposit).toHaveBeenCalledWith(DEP);
      expect(balances.completeDeposit).not.toHaveBeenCalled();
    });

    it('a failing listener does not fail the callback', async () => {
      paid.mockRejectedValue(new Error('blocked by user'));
      await expect(
        service.handleCallback({ event: 'invoice.paid', invoice: invoice() as never }),
      ).resolves.toBeUndefined();
    });
  });
});
