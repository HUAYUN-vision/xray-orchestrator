import { Logger } from '@nestjs/common';
import { InputFile } from 'grammy';
import { Currency } from '../database/enums';
import type { I18nService } from '../i18n/i18n.service';
import { type PaidListener, TopUpError } from '../modules/payments/top-up.service';
import { PaymentMessagesService } from './payment-messages.service';

const screen = (m: string) => ({ s: 'd', n: 1, m });
const i18n = {
  t: (_l: string, key: string, args?: { amount?: string }) =>
    args?.amount ? `${key}(${args.amount})` : key,
  isSupported: (c: string) => c === 'ru' || c === 'en',
} as unknown as I18nService;

describe('PaymentMessagesService', () => {
  let bot: { botInfo: { username: string }; api: Record<string, jest.Mock> };
  let topUps: { create: jest.Mock; onPaid: jest.Mock };
  let screens: Record<string, jest.Mock>;
  let menu: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let service: PaymentMessagesService;
  const target = { userId: 'u1', chatId: 42, messageId: 10, locale: 'en' as const };

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    bot = {
      botInfo: { username: 'test_bot' },
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
        sendPhoto: jest.fn(),
        editMessageText: jest.fn().mockResolvedValue(true),
      },
    };
    topUps = {
      create: jest.fn().mockResolvedValue({
        depositId: 'd1',
        provider: 'yookassa',
        currency: Currency.RUB,
        amount: '300',
        paymentUrl: 'https://pay.test/1',
      }),
      onPaid: jest.fn(),
    };
    screens = {
      topUp: jest.fn((_u: string, m: string) => Promise.resolve(screen(m))),
      home: jest.fn((_u: string, m: string) => Promise.resolve({ s: 'h', m })),
    };
    menu = {
      view: jest.fn().mockResolvedValue({ text: 'home', reply_markup: { inline_keyboard: [] } }),
    };
    users = { findByIds: jest.fn().mockResolvedValue([{ telegramId: 42, language: null }]) };
    service = new PaymentMessagesService(
      bot as never,
      topUps as never,
      screens as never,
      menu as never,
      users as never,
      i18n,
    );
    service.onModuleInit();
  });

  it('YooKassa: a message with a URL button, then "link sent" on the widget', async () => {
    await expect(service.sendInvoice(target, Currency.RUB, '300')).resolves.toEqual(screen('inv'));
    expect(topUps.create).toHaveBeenCalledWith({
      userId: 'u1',
      currency: Currency.RUB,
      amount: '300',
      description: 'topup-description',
      returnUrl: 'https://t.me/test_bot',
      messageId: 10,
      locale: 'en',
    });
    expect(bot.api.sendMessage).toHaveBeenCalledWith(42, 'topup-link(300 ₽)', {
      reply_markup: { inline_keyboard: [[{ text: 'topup-pay', url: 'https://pay.test/1' }]] },
    });
  });

  it('WeChat: a QR code picture of the weixin:// link', async () => {
    topUps.create.mockResolvedValue({
      provider: 'wechat',
      currency: Currency.CNY,
      amount: '30',
      paymentUrl: 'weixin://wxpay/bizpayurl?pr=abc',
    });
    await service.sendInvoice(target, Currency.CNY, '30');
    const [chatId, file, opts] = bot.api.sendPhoto.mock.calls[0] as [number, InputFile, object];
    expect(chatId).toBe(42);
    expect(file).toBeInstanceOf(InputFile);
    expect(opts).toEqual({ caption: 'topup-qr(30 ¥)' });
    expect(bot.api.sendMessage).not.toHaveBeenCalled();
  });

  it('top-up error → "unavailable" on the widget, no message', async () => {
    topUps.create.mockRejectedValue(new TopUpError('provider'));
    await expect(service.sendInvoice(target, Currency.RUB, '300')).resolves.toEqual(
      screen('payerr'),
    );
    expect(bot.api.sendMessage).not.toHaveBeenCalled();
  });

  it('after payment: a message in the user language and the menu refreshed', async () => {
    const onPaid = topUps.onPaid.mock.calls[0][0] as PaidListener;
    await onPaid({
      userId: 'u1',
      currency: Currency.RUB,
      amount: '300',
      meta: { messageId: 10, locale: 'ru' },
    });
    expect(bot.api.sendMessage).toHaveBeenCalledWith(42, 'topup-paid(300 ₽)');
    expect(screens.home).toHaveBeenCalledWith('u1', 'dep');
    expect(menu.view).toHaveBeenCalledWith({ s: 'h', m: 'dep' }, 'ru', 'u1');
    expect(bot.api.editMessageText).toHaveBeenCalledWith(42, 10, 'home', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
      link_preview_options: { is_disabled: true },
    });
  });

  it('a deleted menu does not break the notification', async () => {
    bot.api.editMessageText.mockRejectedValue(new Error('message to edit not found'));
    const onPaid = topUps.onPaid.mock.calls[0][0] as PaidListener;
    await expect(
      onPaid({ userId: 'u1', currency: Currency.RUB, amount: '1', meta: { messageId: 9 } }),
    ).resolves.toBeUndefined();
  });
});
