import { Injectable, Logger } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { AppConfigService } from '../../config/app-config.service';
import type { User } from '../../database/entities';
import { UsersRepository } from '../../database/repositories/users.repository';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/i18n.constants';
import { I18nService } from '../../i18n/i18n.service';
import {
  type ServerChange,
  ServersAdminError,
  ServersAdminService,
} from '../../modules/servers/servers-admin.service';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { MENU_COMMANDS } from './commands.handler';

/** Admin-only commands, added to the menu of admins' chats. */
export const ADMIN_COMMANDS = ['servers', 'server_add'] as const;

type Action = 'list' | 'on' | 'off' | 'sync' | 'del' | 'del!';
const CALLBACK_RE = /^srv:(list|on|off|sync|del!?)(?::([0-9a-f-]{36}))?$/;

const CODE_RE = /^[a-z0-9-]{1,32}$/;
const HOST_RE = /^(?=.{1,255}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const API_KEY_RE = /^[\x21-\x7e]{1,255}$/;
const DEFAULT_API_PORT = 440;

/**
 * Server admin (D19): /servers — list with inline buttons, /server_add — new server.
 * Admins are `users.id` from ADMIN_USER_IDS; for anyone else these commands do not exist.
 * /id is for everyone: it shows the `users.id` to put into ADMIN_USER_IDS.
 */
@Injectable()
export class AdminHandler implements BotHandler {
  private readonly logger = new Logger(AdminHandler.name);
  private readonly admins: ReadonlySet<string>;

  constructor(
    config: AppConfigService,
    private readonly servers: ServersAdminService,
    private readonly users: UsersRepository,
    private readonly i18n: I18nService,
  ) {
    this.admins = new Set(config.get('ADMIN_USER_IDS'));
  }

  register(bot: AppBot): void {
    bot.command('id', (ctx) => this.id(ctx));
    const admin = bot.filter((ctx) => this.isAdmin(ctx));
    admin.command('servers', (ctx) => this.list(ctx));
    admin.command('server_add', (ctx) => this.add(ctx));
    admin.callbackQuery(CALLBACK_RE, (ctx) => this.onCallback(ctx));
    // A non-admin tapping an old admin keyboard: just stop the spinner.
    bot.callbackQuery(/^srv:/, (ctx) => ctx.answerCallbackQuery());
  }

  /** Menu with admin commands in each admin's chat (in the admin's language). */
  async init(bot: AppBot): Promise<void> {
    if (this.admins.size === 0) return;
    try {
      const admins = await this.users.findByIds([...this.admins]);
      for (const user of admins) {
        const locale = this.localeOf(user);
        const commands = [...MENU_COMMANDS, ...ADMIN_COMMANDS].map((command) => ({
          command,
          description: this.i18n.t(locale, `command-${command}`),
        }));
        await bot.api.setMyCommands(commands, {
          scope: { type: 'chat', chat_id: user.telegramId },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to set admin commands: ${String(err)}`);
    }
  }

  isAdmin(ctx: BotContext): boolean {
    return ctx.user !== undefined && this.admins.has(ctx.user.id);
  }

  async id(ctx: BotContext): Promise<void> {
    if (!ctx.user) return;
    await ctx.reply(ctx.t('id-yours', { id: ctx.user.id }), { parse_mode: 'HTML' });
  }

  async list(ctx: BotContext): Promise<void> {
    const { text, keyboard } = await this.render(ctx);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  async add(ctx: BotContext): Promise<void> {
    const raw = (typeof ctx.match === 'string' ? ctx.match : '').trim();
    // The message carries the node's API key: remove it from the chat right away.
    if (raw) await ctx.deleteMessage().catch(() => undefined);

    const parts = raw ? raw.split(/\s+/) : [];
    if (parts.length < 3 || parts.length > 4) {
      await ctx.reply(ctx.t('admin-add-usage'), { parse_mode: 'HTML' });
      return;
    }
    const code = parts[0].toLowerCase();
    const host = parts[1].toLowerCase();
    const apiKey = parts[2];
    const apiPort = parts[3] === undefined ? DEFAULT_API_PORT : Number(parts[3]);
    const invalid = !CODE_RE.test(code)
      ? 'code'
      : !HOST_RE.test(host)
        ? 'host'
        : !API_KEY_RE.test(apiKey)
          ? 'api_key'
          : !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535
            ? 'api_port'
            : null;
    if (invalid) {
      await ctx.reply(ctx.t('admin-add-invalid', { field: invalid }), { parse_mode: 'HTML' });
      return;
    }

    const status = await ctx.reply(ctx.t('admin-add-checking', { code: esc(code) }), {
      parse_mode: 'HTML',
    });
    let text: string;
    try {
      const change = await this.servers.add({ code, host, apiKey, apiPort });
      text = this.changeNote(ctx, 'add', change) + '\n\n' + ctx.t('admin-see-list');
    } catch (err) {
      text = this.errorNote(ctx, err, code);
    }
    await ctx.api.editMessageText(status.chat.id, status.message_id, text, { parse_mode: 'HTML' });
  }

  async onCallback(ctx: BotContext): Promise<void> {
    const m = CALLBACK_RE.exec(ctx.callbackQuery?.data ?? '');
    if (!m) return void (await ctx.answerCallbackQuery());
    const action = m[1] as Action;
    const id = m[2];

    // The confirmation screen is instant; everything else talks to nodes for seconds.
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
          note = this.changeNote(ctx, action, await this.servers.setEnabled(id, action === 'on'));
          break;
        case 'sync':
          note = this.changeNote(ctx, action, await this.servers.syncNow(id));
          break;
        case 'del!':
          note = this.changeNote(ctx, action, await this.servers.remove(id));
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
    let server;
    try {
      server = await this.servers.get(id);
    } catch (err) {
      return this.edit(ctx, await this.render(ctx, this.errorNote(ctx, err)));
    }
    const keyboard = new InlineKeyboard()
      .text(ctx.t('admin-btn-delete'), `srv:del!:${id}`)
      .text(ctx.t('admin-btn-cancel'), 'srv:list');
    await this.edit(ctx, {
      text: ctx.t('admin-delete-confirm', { code: esc(server.code), host: esc(server.host) }),
      keyboard,
    });
  }

  /**
   * Replaces the message with "⏳ doing X…" and no buttons until the action is done:
   * the tap is visibly accepted and cannot be repeated meanwhile.
   */
  private async showProgress(ctx: BotContext, action: Action, id?: string): Promise<void> {
    try {
      const code = id ? (await this.servers.get(id)).code : '';
      const key = action === 'del!' ? 'admin-progress-del' : `admin-progress-${action}`;
      await this.edit(ctx, { text: ctx.t(key, { code: esc(code) }) });
    } catch (err) {
      // Cosmetic: the action itself still runs and reports its own errors.
      this.logger.debug(`Progress message failed: ${String(err)}`);
    }
  }

  /** Server list with a note on top and a keyboard row per server. */
  private async render(
    ctx: BotContext,
    note?: string,
  ): Promise<{ text: string; keyboard: InlineKeyboard }> {
    const list = await this.servers.list();
    const keyboard = new InlineKeyboard();
    const lines = list.map(({ server: s, clients }) => {
      keyboard
        .text(`${s.enabled ? '⏸' : '▶️'} ${s.code}`, `srv:${s.enabled ? 'off' : 'on'}:${s.id}`)
        .text('🔄', `srv:sync:${s.id}`)
        .text('🗑', `srv:del:${s.id}`)
        .row();
      const node =
        clients === null
          ? ctx.t('admin-node-down')
          : ctx.t('admin-node-clients', { count: clients });
      return `${s.enabled ? '🟢' : '⚪️'} <b>${esc(s.code)}</b> — ${esc(s.host)}:${s.apiPort}\n    ${node}`;
    });
    keyboard.text(ctx.t('admin-btn-refresh'), 'srv:list');

    const body = lines.length
      ? `${ctx.t('admin-servers-title')}\n\n${lines.join('\n')}`
      : ctx.t('admin-servers-empty');
    const text = [note, body, ctx.t('admin-add-hint')].filter(Boolean).join('\n\n');
    return { text, keyboard };
  }

  private changeNote(
    ctx: BotContext,
    action: 'add' | 'on' | 'off' | 'sync' | 'del!',
    { server, report, noneEnabled }: ServerChange,
  ): string {
    const code = esc(server.code);
    const error = report.error ? esc(report.error.slice(0, 200)) : undefined;
    const keys = { code, added: report.added, removed: report.removed };
    const name = {
      add: 'admin-added',
      on: 'admin-enabled',
      off: 'admin-disabled',
      sync: 'admin-synced',
      'del!': 'admin-deleted',
    }[action];
    let note = error ? ctx.t(`${name}-node-down`, { code, error }) : ctx.t(name, keys);
    if (noneEnabled) note += '\n\n' + ctx.t('admin-none-enabled');
    return note;
  }

  private errorNote(ctx: BotContext, err: unknown, code?: string): string {
    if (err instanceof ServersAdminError) {
      if (err.code === 'unreachable') {
        return ctx.t('admin-add-unreachable', {
          code: esc(code ?? ''),
          error: esc(err.message.slice(0, 200)),
        });
      }
      return ctx.t(err.code === 'exists' ? 'admin-add-exists' : 'admin-not-found');
    }
    this.logger.error(`Admin action failed: ${String(err)}`);
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

  private localeOf(user: User): Locale {
    return user.language && this.i18n.isSupported(user.language) ? user.language : DEFAULT_LOCALE;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
