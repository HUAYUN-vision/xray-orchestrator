import { Logger } from '@nestjs/common';
import { I18nService } from '../../i18n/i18n.service';
import type { BotContext } from '../bot-context';
import { MenuHandler } from './menu.handler';

const view = { text: 'screen', reply_markup: { inline_keyboard: [] } };
const home = { s: 'h', n: 1 };
const user = { id: 'u1', telegramId: 42, firstName: 'Ann', language: null };

describe('MenuHandler', () => {
  const i18n = new I18nService();
  let menu: Record<string, jest.Mock>;
  let screens: Record<string, jest.Mock>;
  let payments: Record<string, jest.Mock>;
  let topUps: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let handler: MenuHandler;
  let api: Record<string, jest.Mock>;
  const order: string[] = [];

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    order.length = 0;
    menu = {
      view: jest.fn().mockResolvedValue(view),
      languageView: jest.fn().mockReturnValue(view),
      amountView: jest.fn().mockReturnValue(view),
    };
    screens = {
      home: jest.fn().mockResolvedValue(home),
      key: jest.fn().mockResolvedValue({ s: 'k' }),
      topUp: jest.fn().mockResolvedValue({ s: 'd' }),
      execute: jest.fn(() => (order.push('execute'), Promise.resolve(home))),
    };
    payments = { sendInvoice: jest.fn().mockResolvedValue({ s: 'd', m: 'inv' }) };
    topUps = {
      limits: jest.fn((c: string) => (c === 'rub' ? { min: '100', max: '100000' } : null)),
    };
    users = { setLanguage: jest.fn().mockResolvedValue(undefined) };
    api = { editMessageText: jest.fn(() => (order.push('edit'), Promise.resolve(true))) };
    handler = new MenuHandler(
      menu as never,
      screens as never,
      payments as never,
      topUps as never,
      users as never,
      i18n,
    );
  });

  const ctx = (data: string) =>
    ({
      user: { ...user },
      locale: 'ru',
      callbackQuery: { data, message: { chat: { id: 42 }, message_id: 10 } },
      answerCallbackQuery: jest.fn(() => (order.push('answer'), Promise.resolve(true))),
      api,
      t: (key: string) => key,
      reply: jest.fn().mockResolvedValue({}),
    }) as unknown as BotContext & { answerCallbackQuery: jest.Mock; reply: jest.Mock };

  const tap = (c: BotContext) =>
    (
      handler as unknown as { onCallback: (c: BotContext, n: () => Promise<void>) => Promise<void> }
    ).onCallback(c, jest.fn().mockResolvedValue(undefined));

  it('/start: welcome line + home screen with buttons', async () => {
    const c = ctx('');
    await handler.sendHome(c, true);
    expect(c.reply).toHaveBeenCalledWith('start\n\nscreen', {
      parse_mode: 'HTML',
      reply_markup: view.reply_markup,
      link_preview_options: { is_disabled: true },
    });
  });

  it('a tap: answers first, runs the command, edits the menu in place', async () => {
    await tap(ctx('b'));
    expect(order).toEqual(['answer', 'execute', 'edit']);
    expect(screens.execute).toHaveBeenCalledWith('u1', { c: 'tariffs' });
    expect(api.editMessageText).toHaveBeenCalledWith(42, 10, 'screen', expect.any(Object));
  });

  it('foreign callbacks (admin srv:*) go to the next handler', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const c = ctx('srv:list');
    await (
      handler as unknown as { onCallback: (c: BotContext, n: () => Promise<void>) => Promise<void> }
    ).onCallback(c, next);
    expect(next).toHaveBeenCalled();
    expect(c.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it('language: screen, then the choice is saved and home is shown in it', async () => {
    await tap(ctx('g'));
    expect(menu.languageView).toHaveBeenCalledWith('ru');

    await tap(ctx('g:en'));
    expect(users.setLanguage).toHaveBeenCalledWith(42, 'en');
    expect(menu.view).toHaveBeenCalledWith(home, 'en', 'u1');
  });

  it('unknown language is ignored', async () => {
    await tap(ctx('g:xx'));
    expect(users.setLanguage).not.toHaveBeenCalled();
  });

  it('top-up amount: invoice with the menu message to refresh after payment', async () => {
    await tap(ctx('d:rub:300'));
    expect(payments.sendInvoice).toHaveBeenCalledWith(
      { userId: 'u1', chatId: 42, messageId: 10, locale: 'ru' },
      'rub',
      '300',
    );
  });

  describe('custom amount', () => {
    const text = (t: string, chatId = 42) =>
      ({
        user: { ...user },
        locale: 'ru',
        chat: { id: chatId },
        message: { text: t },
        api,
        t: (key: string, args?: object) => `${key}${args ? JSON.stringify(args) : ''}`,
        reply: jest.fn().mockResolvedValue({}),
      }) as unknown as BotContext & { reply: jest.Mock };
    const type = async (c: BotContext) => {
      const next = jest.fn().mockResolvedValue(undefined);
      await (
        handler as unknown as { onText: (c: BotContext, n: () => Promise<void>) => Promise<void> }
      ).onText(c, next);
      return next;
    };

    it('button → prompt; typed amount → invoice and the menu shows the result', async () => {
      await tap(ctx('a:rub'));
      expect(menu.amountView).toHaveBeenCalledWith('rub', { min: '100', max: '100000' }, 'ru');

      const next = await type(text('1 500,5 ₽'));
      expect(next).not.toHaveBeenCalled();
      expect(payments.sendInvoice).toHaveBeenCalledWith(
        { userId: 'u1', chatId: 42, messageId: 10, locale: 'ru' },
        'rub',
        '1500.5',
      );
      expect(api.editMessageText).toHaveBeenLastCalledWith(42, 10, 'screen', expect.any(Object));

      // The prompt is used once: further text goes to other handlers.
      expect(await type(text('500'))).toHaveBeenCalled();
    });

    it('bad or out-of-range amount: a hint, still waiting', async () => {
      await tap(ctx('a:rub'));
      for (const bad of ['abc', '50', '100001', '10.555']) {
        const c = text(bad);
        await type(c);
        expect(c.reply).toHaveBeenCalledWith('menu-topup-invalid{"min":"100 ₽","max":"100000 ₽"}');
      }
      expect(payments.sendInvoice).not.toHaveBeenCalled();
      await type(text('100'));
      expect(payments.sendInvoice).toHaveBeenCalledWith(expect.anything(), 'rub', '100');
    });

    it('another button, a command or another chat cancels / skips the prompt', async () => {
      await tap(ctx('a:rub'));
      expect(await type(text('/start'))).toHaveBeenCalled();
      expect(await type(text('500', 7))).toHaveBeenCalled();

      await tap(ctx('a:rub'));
      await tap(ctx('d'));
      expect(await type(text('500'))).toHaveBeenCalled();
      expect(payments.sendInvoice).not.toHaveBeenCalled();
    });

    it('currency without top-up → top-up screen, no prompt; text without a prompt passes', async () => {
      await tap(ctx('a:cny'));
      expect(menu.amountView).not.toHaveBeenCalled();
      expect(screens.topUp).toHaveBeenCalledWith('u1');
      expect(await type(text('500'))).toHaveBeenCalled();
    });
  });

  it('a failure shows home with an error; "not modified" is not an error', async () => {
    screens.execute.mockRejectedValueOnce(new Error('db down'));
    await tap(ctx('b'));
    expect(screens.home).toHaveBeenCalledWith('u1', 'err');

    api.editMessageText.mockRejectedValueOnce(new Error('message is not modified'));
    await expect(tap(ctx('h'))).resolves.toBeUndefined();
  });
});
