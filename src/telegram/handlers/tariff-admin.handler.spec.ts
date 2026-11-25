import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import { Currency } from '../../database/enums';
import type { Tariff } from '../../database/entities';
import { I18nService } from '../../i18n/i18n.service';
import { TariffsAdminError } from '../../modules/tariffs/tariffs-admin.service';
import type { BotContext } from '../bot-context';
import { TariffAdminHandler } from './tariff-admin.handler';

const ADMIN = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const ID = '22222222-2222-4222-8222-222222222222';
const GIB = 1024 ** 3;

const tariff = (over: Partial<Tariff> = {}): Tariff => ({
  id: ID,
  durationDays: 30,
  price: '299.00000000',
  currency: Currency.RUB,
  trafficLimit: null,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const change = (over: Partial<Tariff> = {}, keys = 0) => ({
  tariff: tariff(over),
  keys,
  noneActive: false,
});

describe('TariffAdminHandler', () => {
  let tariffs: Record<string, jest.Mock>;
  let handler: TariffAdminHandler;
  const i18n = new I18nService();

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    tariffs = {
      list: jest.fn().mockResolvedValue([{ tariff: tariff(), keys: 4 }]),
      add: jest.fn().mockResolvedValue(change()),
      setActive: jest.fn().mockResolvedValue(change({ active: false }, 4)),
      remove: jest.fn().mockResolvedValue(change()),
      get: jest.fn().mockResolvedValue({ tariff: tariff(), keys: 0 }),
    };
    const config = { get: () => [ADMIN] } as unknown as AppConfigService;
    handler = new TariffAdminHandler(config, tariffs as never);
  });

  const ctx = (extra: Record<string, unknown> = {}) => {
    const c = {
      user: { id: ADMIN, telegramId: 42, language: null },
      locale: 'en',
      t: (key: string, args?: Record<string, string | number>) => i18n.t('en', key, args),
      reply: jest.fn().mockResolvedValue({ chat: { id: 42 }, message_id: 7 }),
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
      ...extra,
    };
    return c as typeof c & BotContext;
  };
  const tap = (data: string) => ctx({ callbackQuery: { data } });

  it('/tariffs lists tariffs with a hide and a delete button', async () => {
    const c = ctx();
    await handler.list(c);
    const [text, opts] = c.reply.mock.calls[0] as [
      string,
      { reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } },
    ];
    expect(text).toContain('🟢 <b>30 days · 299 ₽, unlimited</b>');
    expect(text).toContain('keys: 4');
    expect(text).toContain('/tariff_add');
    const row = opts.reply_markup.inline_keyboard[0];
    expect(row.map((b) => b.callback_data)).toEqual([`trf:off:${ID}`, `trf:del:${ID}`]);
    expect(row[0].text).toContain('30 days');
    for (const buttons of opts.reply_markup.inline_keyboard) {
      for (const b of buttons) {
        expect(b.text.length).toBeLessThanOrEqual(64);
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
      }
    }
  });

  it('a hidden tariff offers a show button and says it is hidden', async () => {
    tariffs.list.mockResolvedValue([{ tariff: tariff({ active: false, price: '0' }), keys: 1 }]);
    const c = ctx();
    await handler.list(c);
    const [text, opts] = c.reply.mock.calls[0] as [
      string,
      { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
    ];
    expect(text).toContain('⚪️ <b>30 days · free, unlimited</b>');
    expect(text).toContain('hidden from sale, keys: 1');
    expect(text).toContain('No tariffs on sale');
    expect(opts.reply_markup.inline_keyboard[0][0].callback_data).toBe(`trf:on:${ID}`);
  });

  it('warns when more tariffs are on sale than the shop can show', async () => {
    tariffs.list.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        tariff: tariff({ id: `00000000-0000-4000-8000-00000000000${i}`, durationDays: i + 1 }),
        keys: 0,
      })),
    );
    const c = ctx();
    await handler.list(c);
    expect(c.reply.mock.calls[0][0]).toContain('7 tariffs are on sale, buyers only see the 6');
  });

  describe('/tariff_add', () => {
    it('parses days, a comma price, currency and traffic in either order', async () => {
      const c = ctx({ match: '30 299,50 CNY 50gb' });
      await handler.add(c);
      expect(tariffs.add).toHaveBeenCalledWith({
        durationDays: 30,
        price: '299.5',
        currency: Currency.CNY,
        trafficLimit: 50 * GIB,
      });
      expect(c.reply.mock.calls[0][0]).toContain('added and on sale');
      expect(c.reply.mock.calls[0][0]).toContain('List: /tariffs');
    });

    it('defaults to rub and unlimited; 0 is a free tariff', async () => {
      await handler.add(ctx({ match: '7 0' }));
      expect(tariffs.add).toHaveBeenCalledWith({
        durationDays: 7,
        price: '0',
        currency: Currency.RUB,
        trafficLimit: null,
      });
    });

    it('a bare gigabyte count is traffic, and 100 then rub is accepted', async () => {
      await handler.add(ctx({ match: '30 299 100 rub' }));
      expect(tariffs.add).toHaveBeenCalledWith(
        expect.objectContaining({ currency: Currency.RUB, trafficLimit: 100 * GIB }),
      );
    });

    it('no arguments → usage', async () => {
      const c = ctx({ match: '' });
      await handler.add(c);
      expect(c.reply.mock.calls[0][0]).toContain('Format:');
      expect(tariffs.add).not.toHaveBeenCalled();
    });

    it.each([
      ['0 10', 'days'],
      ['3651 10', 'days'],
      ['30 10.999', 'price'],
      ['30 10 bitcoin', 'currency'],
      ['30 10 rub cny', 'currency'],
      ['30 10 100 200', 'traffic'],
      ['30 10 1048577', 'traffic'],
    ])('%p → invalid %s', async (match, field) => {
      const c = ctx({ match });
      await handler.add(c);
      expect(c.reply.mock.calls[0][0]).toContain(`<b>${field}</b>`);
      expect(tariffs.add).not.toHaveBeenCalled();
    });
  });

  describe('buttons', () => {
    it('off hides the tariff and says bought keys keep working', async () => {
      const c = tap(`trf:off:${ID}`);
      await handler.onCallback(c);
      expect(c.answerCallbackQuery).toHaveBeenCalledWith({ text: '⏳ Working…' });
      expect(tariffs.setActive).toHaveBeenCalledWith(ID, false);
      const text = c.editMessageText.mock.lastCall![0] as string;
      expect(text).toMatch(/^⏸ <b>30 days · 299 ₽, unlimited<\/b> is hidden from sale/);
      expect(text).toContain('Keys already bought keep working.');
      expect(text).toContain('<b>Tariffs</b>');
    });

    it('shows a progress message without buttons before the action', async () => {
      const c = tap(`trf:off:${ID}`);
      let progress: unknown[] | undefined;
      tariffs.setActive.mockImplementation(() => {
        progress = c.editMessageText.mock.calls[0];
        return Promise.resolve(change({ active: false }, 4));
      });
      await handler.onCallback(c);
      expect(progress).toEqual([
        '⏳ Hiding <b>30 days · 299 ₽, unlimited</b> from sale…',
        { parse_mode: 'HTML', reply_markup: undefined },
      ]);
      expect(c.editMessageText).toHaveBeenCalledTimes(2);
    });

    it('the delete confirmation is instant when nobody bought the tariff', async () => {
      const c = tap(`trf:del:${ID}`);
      await handler.onCallback(c);
      expect(c.answerCallbackQuery).toHaveBeenCalledWith();
      expect(tariffs.remove).not.toHaveBeenCalled();
      expect(c.editMessageText).toHaveBeenCalledTimes(1);
      const [text, opts] = c.editMessageText.mock.lastCall! as [
        string,
        { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
      ];
      expect(text).toContain('Delete tariff <b>30 days · 299 ₽, unlimited</b>?');
      expect(opts.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
        `trf:del!:${ID}`,
        'trf:list',
      ]);
    });

    it('del of a tariff with keys does not ask to delete it', async () => {
      tariffs.get.mockResolvedValue({ tariff: tariff(), keys: 3 });
      const c = tap(`trf:del:${ID}`);
      await handler.onCallback(c);
      expect(tariffs.remove).not.toHaveBeenCalled();
      const text = c.editMessageText.mock.lastCall![0] as string;
      expect(text).toMatch(/^Cannot delete this tariff/);
      expect(text).toContain('<b>Tariffs</b>');
    });

    it('del! deletes and shows the result above the list', async () => {
      const c = tap(`trf:del!:${ID}`);
      await handler.onCallback(c);
      expect(tariffs.remove).toHaveBeenCalledWith(ID);
      expect(c.editMessageText.mock.lastCall![0]).toContain('deleted');
    });

    it('on shows the tariff again', async () => {
      tariffs.setActive.mockResolvedValue(change());
      const c = tap(`trf:on:${ID}`);
      await handler.onCallback(c);
      expect(tariffs.setActive).toHaveBeenCalledWith(ID, true);
      expect(c.editMessageText.mock.lastCall![0]).toContain('is on sale again');
    });

    it('a tariff that gained a key during deletion is reported as in use', async () => {
      tariffs.remove.mockRejectedValue(new TariffsAdminError('in_use'));
      const c = tap(`trf:del!:${ID}`);
      await handler.onCallback(c);
      expect(c.editMessageText.mock.lastCall![0]).toMatch(/^Cannot delete this tariff/);
    });

    it('unknown tariff → "not found"', async () => {
      tariffs.setActive.mockRejectedValue(new TariffsAdminError('not_found'));
      const c = tap(`trf:on:${ID}`);
      await handler.onCallback(c);
      expect(c.editMessageText.mock.lastCall![0]).toMatch(/^Tariff not found\./);
    });

    it('refresh with nothing changed is not an error', async () => {
      const c = tap('trf:list');
      c.editMessageText.mockRejectedValue(new Error('Bad Request: message is not modified'));
      await expect(handler.onCallback(c)).resolves.toBeUndefined();
    });

    it('traffic is shown in gigabytes', async () => {
      tariffs.list.mockResolvedValue([{ tariff: tariff({ trafficLimit: 100 * GIB }), keys: 0 }]);
      const c = ctx();
      await handler.list(c);
      expect(c.reply.mock.calls[0][0]).toContain('100 GB');
    });
  });
});
