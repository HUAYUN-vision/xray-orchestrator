import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { InlineKeyboard } from 'grammy';
import { AppConfigService } from '../../config/app-config.service';
import type { Tariff } from '../../database/entities';
import { Currency } from '../../database/enums';
import type { NewTariff } from '../../database/repositories/tariffs.repository';
import {
  TariffsAdminError,
  type TariffChange,
  TariffsAdminService,
} from '../../modules/tariffs/tariffs-admin.service';
import { MAX_TARIFFS } from '../../widget/widget-screens.service';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { esc, money } from '../menu/format';

/** Admin-only commands, added to the menu of admins' chats next to the server commands. */
export const TARIFF_ADMIN_COMMANDS = ['tariffs', 'tariff_add'] as const;

type Action = 'list' | 'on' | 'off' | 'del' | 'del!';
const CALLBACK_RE = /^trf:(list|on|off|del!?)(?::([0-9a-f-]{36}))?$/;

/** 1 .. 10 years. Longer than any plan we sell; rejects a typo like an extra zero. */
const DAYS_MAX = 3650;
/** 1 PiB. Stays inside Number.MAX_SAFE_INTEGER as bytes. */
const TRAFFIC_GB_MAX = 1_048_576;
const GIB = 1024 ** 3;

const DAYS_RE = /^\d{1,4}$/;
const PRICE_RE = /^\d{1,12}(?:[.,]\d{1,2})?$/;
const TRAFFIC_RE = /^(\d{1,7})(?:gb|g)?$/i;
const UNLIMITED = new Set(['0', '-', 'inf', 'unlim']);

type Field = 'days' | 'price' | 'currency' | 'traffic';
type Parsed =
  | { ok: true; value: NewTariff }
  | { ok: false; reason: 'usage' }
  | { ok: false; reason: 'invalid'; field: Field };

/**
 * Tariff admin, same shape as the server admin: /tariffs — list with inline buttons,
 * /tariff_add — a new tariff on sale. Hiding removes it from the shop and leaves
 * purchased keys alone. Delete asks for confirmation and only works when nobody bought it.
 * Admins are `users.id` from ADMIN_USER_IDS; for anyone else these commands do not exist.
 */
@Injectable()
export class TariffAdminHandler implements BotHandler {
  private readonly logger = new Logger(TariffAdminHandler.name);
  private readonly admins: ReadonlySet<string>;

  constructor(
    config: AppConfigService,
    private readonly tariffs: TariffsAdminService,
  ) {
    this.admins = new Set(config.get('ADMIN_USER_IDS'));
  }

  register(bot: AppBot): void {
    const admin = bot.filter((ctx) => this.isAdmin(ctx));
    admin.command('tariffs', (ctx) => this.list(ctx));
    admin.command('tariff_add', (ctx) => this.add(ctx));
    admin.callbackQuery(CALLBACK_RE, (ctx) => this.onCallback(ctx));
    // A non-admin tapping an old admin keyboard: just stop the spinner.
    bot.callbackQuery(/^trf:/, (ctx) => ctx.answerCallbackQuery());
  }

  private isAdmin(ctx: BotContext): boolean {
    return ctx.user !== undefined && this.admins.has(ctx.user.id);
  }

  async list(ctx: BotContext): Promise<void> {
    const { text, keyboard } = await this.render(ctx);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  async add(ctx: BotContext): Promise<void> {
    const raw = typeof ctx.match === 'string' ? ctx.match : '';
    const parsed = parseTariffAdd(raw);
    if (!parsed.ok) {
      const text =
        parsed.reason === 'usage'
          ? ctx.t('admin-tariff-add-usage')
          : ctx.t('admin-tariff-invalid', { field: parsed.field });
      await ctx.reply(text, { parse_mode: 'HTML' });
      return;
    }

    let text: string;
    try {
      text =
        this.changeNote(ctx, 'add', await this.tariffs.add(parsed.value)) +
        '\n\n' +
        ctx.t('admin-tariff-see-list');
    } catch (err) {
      text = this.errorNote(ctx, err);
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  async onCallback(ctx: BotContext): Promise<void> {
    const m = CALLBACK_RE.exec(ctx.callbackQuery?.data ?? '');
    if (!m) return void (await ctx.answerCallbackQuery());
    const action = m[1] as Action;
    const id = m[2];

    // The confirmation screen is instant; hiding and deleting only touch the database,
    // but the buttons still go away until the result is in, so the tap cannot be repeated.
    if (action === 'del' && id) {
      await ctx.answerCallbackQuery();
      return this.confirmDelete(ctx, id);
    }
    await ctx.answerCallbackQuery({ text: ctx.t('admin-progress-toast') });
    await this.showProgress(ctx, action, id);

    if (action === 'list' || !id) return this.edit(ctx, await this.render(ctx));

    let note: string;
    try {
      switch (action) {
        case 'on':
        case 'off':
          note = this.changeNote(ctx, action, await this.tariffs.setActive(id, action === 'on'));
          break;
        case 'del!':
          note = this.changeNote(ctx, action, await this.tariffs.remove(id));
          break;
        default:
          return;
      }
    } catch (err) {
      note = this.errorNote(ctx, err);
    }
    await this.edit(ctx, await this.render(ctx, note));
  }

  private async confirmDelete(ctx: BotContext, id: string): Promise<void> {
    let status;
    try {
      status = await this.tariffs.get(id);
    } catch (err) {
      return this.edit(ctx, await this.render(ctx, this.errorNote(ctx, err)));
    }
    if (status.keys > 0) {
      return this.edit(ctx, await this.render(ctx, ctx.t('admin-tariff-in-use')));
    }
    const keyboard = new InlineKeyboard()
      .text(ctx.t('admin-btn-delete'), `trf:del!:${id}`)
      .text(ctx.t('admin-btn-cancel'), 'trf:list');
    await this.edit(ctx, {
      text: ctx.t('admin-tariff-delete-confirm', { label: esc(fullLabel(ctx, status.tariff)) }),
      keyboard,
    });
  }

  /** Replaces the message with "⏳ doing X…" and no buttons until the action is done. */
  private async showProgress(ctx: BotContext, action: Action, id?: string): Promise<void> {
    try {
      const label = id ? esc(fullLabel(ctx, (await this.tariffs.get(id)).tariff)) : '';
      const key =
        action === 'del!' ? 'admin-tariff-progress-del' : `admin-tariff-progress-${action}`;
      await this.edit(ctx, { text: ctx.t(key, { label }) });
    } catch (err) {
      // Cosmetic: the action itself still runs and reports its own errors.
      this.logger.debug(`Progress message failed: ${String(err)}`);
    }
  }

  /** Tariff list with a note on top and a keyboard row per tariff. */
  private async render(
    ctx: BotContext,
    note?: string,
  ): Promise<{ text: string; keyboard: InlineKeyboard }> {
    const list = await this.tariffs.list();
    const keyboard = new InlineKeyboard();
    const lines = list.map(({ tariff, keys }) => {
      const label = fullLabel(ctx, tariff);
      keyboard
        .text(
          buttonText(tariff.active ? '⏸' : '▶️', label),
          `trf:${tariff.active ? 'off' : 'on'}:${tariff.id}`,
        )
        .text('🗑', `trf:del:${tariff.id}`)
        .row();
      const meta = tariff.active
        ? ctx.t('admin-tariff-keys', { count: keys })
        : ctx.t('admin-tariff-hidden-keys', { count: keys });
      return `${tariff.active ? '🟢' : '⚪️'} <b>${esc(label)}</b>\n    ${meta}`;
    });
    keyboard.text(ctx.t('admin-btn-refresh'), 'trf:list');

    const active = list.filter((s) => s.tariff.active).length;
    const body = lines.length
      ? `${ctx.t('admin-tariffs-title')}\n\n${lines.join('\n')}`
      : ctx.t('admin-tariffs-empty');
    const text = [
      note,
      list.length > 0 && active === 0 ? ctx.t('admin-tariff-none-active') : undefined,
      active > MAX_TARIFFS
        ? ctx.t('admin-tariff-too-many', { count: active, max: MAX_TARIFFS })
        : undefined,
      body,
      ctx.t('admin-tariff-add-hint'),
    ]
      .filter(Boolean)
      .join('\n\n');
    return { text, keyboard };
  }

  private changeNote(
    ctx: BotContext,
    action: 'add' | 'on' | 'off' | 'del!',
    change: TariffChange,
  ): string {
    const label = esc(fullLabel(ctx, change.tariff));
    const name = {
      add: 'admin-tariff-added',
      on: 'admin-tariff-shown',
      off: 'admin-tariff-hidden',
      'del!': 'admin-tariff-deleted',
    }[action];
    let note = ctx.t(name, { label });
    if (action === 'off' && change.keys > 0) note += '\n' + ctx.t('admin-tariff-keys-stay');
    return note;
  }

  private errorNote(ctx: BotContext, err: unknown): string {
    if (err instanceof TariffsAdminError) {
      return ctx.t(err.code === 'in_use' ? 'admin-tariff-in-use' : 'admin-tariff-not-found');
    }
    this.logger.error(`Tariff admin action failed: ${String(err)}`);
    return ctx.t('admin-error');
  }

  /** Edits the tapped message; without `keyboard` the buttons are removed. */
  private async edit(
    ctx: BotContext,
    { text, keyboard }: { text: string; keyboard?: InlineKeyboard },
  ): Promise<void> {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      // Tapping "refresh" with nothing changed is not an error.
      if (!String(err).includes('message is not modified')) throw err;
    }
  }
}

function fullLabel(ctx: BotContext, tariff: Tariff): string {
  const price = new BigNumber(tariff.price).isZero()
    ? ctx.t('admin-tariff-free')
    : money(trimZeros(tariff.price), tariff.currency);
  const traffic =
    tariff.trafficLimit === null
      ? ctx.t('admin-tariff-unlimited')
      : ctx.t('admin-tariff-traffic', { gb: formatGb(tariff.trafficLimit) });
  return `${tariff.durationDays} ${ctx.t('w-days')} · ${price}, ${traffic}`;
}

function trimZeros(amount: string): string {
  return new BigNumber(amount).toFixed();
}

function formatGb(bytes: number): string {
  return new BigNumber(bytes).div(GIB).decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed();
}

/** Telegram allows 64 characters on a button. */
function buttonText(mark: string, label: string): string {
  const text = `${mark} ${label}`;
  return text.length <= 64 ? text : `${text.slice(0, 63)}…`;
}

function parseTariffAdd(raw: string): Parsed {
  const parts = raw.trim() ? raw.trim().split(/\s+/) : [];
  if (parts.length < 2 || parts.length > 4) return { ok: false, reason: 'usage' };

  if (!DAYS_RE.test(parts[0])) return { ok: false, reason: 'invalid', field: 'days' };
  const durationDays = Number(parts[0]);
  if (durationDays < 1 || durationDays > DAYS_MAX) {
    return { ok: false, reason: 'invalid', field: 'days' };
  }

  if (!PRICE_RE.test(parts[1])) return { ok: false, reason: 'invalid', field: 'price' };
  const price = new BigNumber(parts[1].replace(',', '.')).toFixed();

  let currency = Currency.RUB;
  let currencySet = false;
  let trafficLimit: number | null = null;
  let trafficSet = false;
  for (const part of parts.slice(2)) {
    const cur = currencyOf(part);
    if (cur) {
      if (currencySet) return { ok: false, reason: 'invalid', field: 'currency' };
      currency = cur;
      currencySet = true;
      continue;
    }
    const traffic = parseTraffic(part);
    if (traffic === 'invalid') {
      return {
        ok: false,
        reason: 'invalid',
        field: /^[a-z]+$/i.test(part) ? 'currency' : 'traffic',
      };
    }
    if (trafficSet) return { ok: false, reason: 'invalid', field: 'traffic' };
    trafficLimit = traffic;
    trafficSet = true;
  }

  return { ok: true, value: { durationDays, price, currency, trafficLimit } };
}

function currencyOf(token: string): Currency | undefined {
  const value = token.toLowerCase();
  return (Object.values(Currency) as string[]).includes(value) ? (value as Currency) : undefined;
}

/** `null` — unlimited. `'invalid'` — not a gigabyte count we accept. */
function parseTraffic(raw: string): number | null | 'invalid' {
  if (UNLIMITED.has(raw.toLowerCase())) return null;
  const m = TRAFFIC_RE.exec(raw);
  if (!m) return 'invalid';
  const gb = Number(m[1]);
  if (gb === 0) return null;
  if (gb > TRAFFIC_GB_MAX) return 'invalid';
  return gb * GIB;
}
