import { Injectable } from '@nestjs/common';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { Currency } from '../../database/enums';
import type { Locale } from '../../i18n/i18n.constants';
import type { AmountLimits } from '../../modules/payments/top-up.service';
import { I18nService } from '../../i18n/i18n.service';
import { WidgetScreensService } from '../../widget/widget-screens.service';
import type {
  Balances,
  HomeState,
  KeyState,
  PayState,
  TariffsState,
  TopUpState,
  WidgetMessage,
  WidgetState,
} from '../../widget/widget-state';
import { date, esc, money, SYMBOL } from './format';

/** Callback data of the language screen and of a language choice (`g:<code>`). */
export const LANGUAGE_SCREEN = 'g';
export const LANGUAGE_PREFIX = 'g:';
/** Callback data of "custom amount" for a currency: `a:<currency>`. */
export const CUSTOM_AMOUNT_PREFIX = 'a:';

/** Messages that report success; the rest are shown as warnings. */
const OK_MESSAGES = new Set<WidgetMessage>(['ok', 'link', 'inv', 'dep']);

export interface MenuView {
  text: string;
  reply_markup: InlineKeyboardMarkup;
}

type Row = InlineKeyboardButton[];

/**
 * Text menu with inline buttons (D21): renders the same screen states as the widget,
 * so all logic stays in WidgetScreensService. Button data uses the widget command
 * protocol (≤ 64 bytes, see widget-state.ts), plus `g` / `g:<code>` for the language.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly i18n: I18nService,
    private readonly screens: WidgetScreensService,
  ) {}

  async view(state: WidgetState, locale: Locale, userId: string): Promise<MenuView> {
    const t = (key: string) => this.i18n.t(locale, key);
    let body: { lines: string[]; rows: Row[] };
    switch (state.s) {
      case 'h':
        body = this.home(state, t);
        break;
      case 'b':
        body = this.tariffs(state, t);
        break;
      case 't':
        body = this.pay(state, t);
        break;
      case 'k':
        body = this.key(
          state,
          t,
          state.u ? await this.screens.subscriptionUrl(userId, state.i) : null,
        );
        break;
      case 'd':
        body = this.topUp(state, t);
        break;
    }
    const lines = state.m ? [this.message(state.m, t), '', ...body.lines] : body.lines;
    return { text: lines.join('\n'), reply_markup: { inline_keyboard: body.rows } };
  }

  /** Language choice; the current one is marked. */
  languageView(locale: Locale): MenuView {
    const rows: Row[] = this.i18n.locales.map((l) => [
      {
        text: `${l === locale ? '✅ ' : ''}${this.i18n.t(l, 'language-name')}`,
        callback_data: `${LANGUAGE_PREFIX}${l}`,
      },
    ]);
    rows.push([{ text: this.i18n.t(locale, 'w-back'), callback_data: 'h' }]);
    return {
      text: `🌐 <b>${esc(this.i18n.t(locale, 'menu-language-title'))}</b>`,
      reply_markup: { inline_keyboard: rows },
    };
  }

  /** Prompt for a custom top-up amount; the amount comes as a text message. */
  amountView(currency: Currency, limits: AmountLimits, locale: Locale): MenuView {
    const t = (key: string, args?: Record<string, string>) => this.i18n.t(locale, key, args);
    const range = { min: money(limits.min, currency), max: money(limits.max, currency) };
    return {
      text: `✏️ <b>${esc(t('menu-topup-custom'))}</b>\n\n${esc(t('menu-topup-amount', range))}`,
      reply_markup: { inline_keyboard: [[{ text: `⬅️ ${t('w-back')}`, callback_data: 'd' }]] },
    };
  }

  private home(s: HomeState, t: T) {
    const lines = [`💰 <b>${t('w-balance')}</b>`, balances(s.b), '', `🔑 <b>${t('w-keys')}</b>`];
    if (s.k.length === 0) lines.push(`<i>${t('w-no-keys')}</i>`);
    const rows: Row[] = s.k.map(([id, exp, active]) => [
      {
        text: `${active ? '🟢' : '⚪️'} ${id.slice(0, 8)} · ${till(t, active, exp)}`,
        callback_data: `k:${id}`,
      },
    ]);
    rows.push([{ text: `🛒 ${t('w-buy')}`, callback_data: 'b' }]);
    if (s.f) rows.push([{ text: `💳 ${t('w-topup')}`, callback_data: 'd' }]);
    rows.push([{ text: `🌐 ${t('menu-language')}`, callback_data: LANGUAGE_SCREEN }]);
    return { lines, rows };
  }

  private tariffs(s: TariffsState, t: T) {
    const lines = [`🛒 <b>${t('w-tariffs')}</b>`];
    if (s.t.length === 0) lines.push(`<i>${t('w-no-tariffs')}</i>`);
    const rows: Row[] = s.t.map(([id, days, price, currency]) => [
      { text: `${days} ${t('w-days')} — ${money(price, currency)}`, callback_data: `t:${id}` },
    ]);
    rows.push([{ text: `⬅️ ${t('w-back')}`, callback_data: 'h' }]);
    return { lines, rows };
  }

  /** Only the currencies the user can afford get a pay button. */
  private pay(s: PayState, t: T) {
    const lines = [
      `🧾 <b>${t('w-pay-title')}: ${s.d} ${t('w-days')}</b>`,
      '',
      `💰 ${balances(s.b)}`,
    ];
    const affordable = s.o.filter(([c, amount]) => Number(s.b[c]) >= Number(amount));
    const rows: Row[] = affordable.map(([c, amount]) => [
      {
        text: `${t('w-pay')} ${money(amount, c)}`,
        callback_data: `p:${s.i}:${c}:${s.q}:${amount}`,
      },
    ]);
    if (affordable.length < s.o.length) {
      const prices = s.o.map(([c, amount]) => money(amount, c)).join(' · ');
      lines.push('', `${t('menu-price')}: ${prices}`);
      if (affordable.length === 0) lines.push(`<i>${t('w-m-funds')}</i>`);
    }
    if (s.f) rows.push([{ text: `💳 ${t('w-topup')}`, callback_data: 'd' }]);
    rows.push([{ text: `⬅️ ${t('w-back')}`, callback_data: 'b' }]);
    return { lines, rows };
  }

  private key(s: KeyState, t: T, url: string | null) {
    const lines = [`🔑 <b>${s.i.slice(0, 8)}</b>`, till(t, s.a, s.e)];
    const rows: Row[] = [];
    if (url) {
      lines.push('', t('w-howto'), '', `<code>${esc(url)}</code>`);
      rows.push([{ text: t('sub-copy'), copy_text: { text: url } }]);
    }
    rows.push([{ text: `⬅️ ${t('w-back')}`, callback_data: 'h' }]);
    return { lines, rows };
  }

  private topUp(s: TopUpState, t: T) {
    const lines = [
      `💳 <b>${t('w-topup-title')}</b>`,
      '',
      `💰 ${balances(s.b)}`,
      '',
      t('w-topup-hint'),
    ];
    // Up to 4 amounts per row: wider rows get cut on phones.
    const rows: Row[] = s.p.flatMap(([c, amounts]) =>
      chunk(amounts, 4).map((part) =>
        part.map((a) => ({ text: money(a, c), callback_data: `d:${c}:${a}` })),
      ),
    );
    if (s.p.length > 0) {
      rows.push(
        s.p.map(([c]) => ({
          text: `✏️ ${t('menu-topup-custom')}, ${SYMBOL[c]}`,
          callback_data: `${CUSTOM_AMOUNT_PREFIX}${c}`,
        })),
      );
    }
    rows.push([{ text: `⬅️ ${t('w-back')}`, callback_data: 'h' }]);
    return { lines, rows };
  }

  private message(m: WidgetMessage, t: T): string {
    return `${OK_MESSAGES.has(m) ? '✅' : '⚠️'} ${t(`w-m-${m}`)}`;
  }
}

type T = (key: string) => string;

function balances(b: Balances): string {
  return Object.values(Currency)
    .map((c) => money(b[c], c))
    .join(' · ');
}

function till(t: T, active: 0 | 1, exp: number): string {
  return active ? `${t('w-until')} ${date(exp)}` : t('w-expired');
}

function chunk<V>(items: V[], size: number): V[][] {
  const out: V[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
