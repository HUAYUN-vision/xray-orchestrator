import { Currency } from '../../database/enums';
import { I18nService } from '../../i18n/i18n.service';
import type { WidgetState } from '../../widget/widget-state';
import { MenuService, type MenuView } from './menu.service';

const K = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const URL = `https://bot.test/api/sub/${K}`;
const b = { rub: '150.00', cny: '0.00', usdt: '2.41' };
const exp = Date.UTC(2026, 11, 31) / 1000;

const buttons = (v: MenuView) => v.reply_markup.inline_keyboard.flat();
const data = (v: MenuView) =>
  buttons(v).map((x) => ('callback_data' in x ? x.callback_data : null));

describe('MenuService', () => {
  const i18n = new I18nService();
  const screens = { subscriptionUrl: jest.fn().mockResolvedValue(URL) };
  const menu = new MenuService(i18n, screens as never);
  const view = (s: WidgetState) => menu.view(s, 'ru', 'u1');

  it('home: balances, keys as buttons, buy / top-up / language', async () => {
    const v = await view({ s: 'h', n: 1, b, k: [[K, exp, 1]], f: 1 });
    expect(v.text).toContain('150.00 ₽ · 0.00 ¥ · 2.41 USDT');
    expect(buttons(v)[0].text).toBe('🟢 11111111 · до 31.12.2026');
    expect(data(v)).toEqual([`k:${K}`, 'b', 'd', 'g']);
  });

  it('home without top-up has no top-up button; a message goes on top', async () => {
    const v = await view({ s: 'h', n: 1, b, k: [], m: 'err' });
    expect(v.text.startsWith('⚠️ ')).toBe(true);
    expect(v.text).toContain(i18n.t('ru', 'w-no-keys'));
    expect(data(v)).toEqual(['b', 'g']);
  });

  it('pay: buttons only for affordable currencies, prices listed when some are not', async () => {
    const v = await view({
      s: 't',
      n: 1,
      i: T,
      d: 30,
      q: 7,
      b,
      o: [
        [Currency.RUB, '199.00'],
        [Currency.USDT, '2.41'],
      ],
      f: 1,
    });
    expect(data(v)).toEqual([`p:${T}:usdt:7:2.41`, 'd', 'b']);
    expect(v.text).toContain('199.00 ₽ · 2.41 USDT');
  });

  it('key: subscription link in the text with a copy button', async () => {
    const v = await view({ s: 'k', n: 1, i: K, e: exp, a: 1, u: 1 });
    expect(v.text).toContain(`<code>${URL}</code>`);
    expect(buttons(v)[0]).toEqual({ text: i18n.t('ru', 'sub-copy'), copy_text: { text: URL } });
  });

  it('expired key: no link', async () => {
    const v = await view({ s: 'k', n: 1, i: K, e: exp, a: 0 });
    expect(v.text).toContain(i18n.t('ru', 'w-expired'));
    expect(data(v)).toEqual(['h']);
  });

  it('top-up: amounts by currency, at most 4 per row, then custom amount per currency', async () => {
    const v = await view({
      s: 'd',
      n: 1,
      b,
      p: [
        [Currency.RUB, ['100', '300', '500', '1000', '5000']],
        [Currency.CNY, ['10']],
      ],
    });
    expect(v.reply_markup.inline_keyboard.map((r) => r.length)).toEqual([4, 1, 1, 2, 1]);
    expect(buttons(v)[0]).toEqual({ text: '100 ₽', callback_data: 'd:rub:100' });
    expect(data(v)).toContain('d:cny:10');
    expect(v.reply_markup.inline_keyboard[3]).toEqual([
      { text: '✏️ Своя сумма, ₽', callback_data: 'a:rub' },
      { text: '✏️ Своя сумма, ¥', callback_data: 'a:cny' },
    ]);
  });

  it('custom amount prompt: range in the text, back to the top-up screen', () => {
    const v = menu.amountView(Currency.RUB, { min: '100', max: '100000' }, 'ru');
    expect(v.text).toContain('от 100 ₽ до 100000 ₽');
    expect(data(v)).toEqual(['d']);
  });

  it('language: every locale, the current one marked', () => {
    const v = menu.languageView('en');
    expect(data(v)).toEqual(['g:ru', 'g:en', 'h']);
    expect(buttons(v)[1].text).toBe('✅ English');
  });

  it('every callback_data fits the 64-byte limit', async () => {
    const v = await view({
      s: 't',
      n: 1,
      i: T,
      d: 30,
      q: 999999999,
      b: { rub: '9999999.00', cny: '0', usdt: '999999.99' },
      o: [[Currency.USDT, '999999.99']],
    });
    for (const d of data(v)) expect(Buffer.byteLength(d ?? '')).toBeLessThanOrEqual(64);
  });
});
