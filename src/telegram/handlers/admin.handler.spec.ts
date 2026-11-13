import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import { I18nService } from '../../i18n/i18n.service';
import { ServersAdminError } from '../../modules/servers/servers-admin.service';
import type { BotContext } from '../bot-context';
import { AdminHandler } from './admin.handler';

const ADMIN = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const SRV = '11111111-1111-4111-8111-111111111111';
const srv = { id: SRV, code: 'sg', host: '10.0.0.1', apiPort: 440, enabled: true };
const change = (report: object = {}, noneEnabled = false) => ({
  server: srv,
  report: { server: 'sg', added: 2, removed: 0, ...report },
  noneEnabled,
});

describe('AdminHandler', () => {
  let servers: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let handler: AdminHandler;
  const i18n = new I18nService();

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    servers = {
      list: jest.fn().mockResolvedValue([{ server: srv, clients: 5 }]),
      add: jest.fn().mockResolvedValue(change()),
      setEnabled: jest.fn().mockResolvedValue(change({ added: 0, removed: 4 })),
      syncNow: jest.fn().mockResolvedValue(change()),
      remove: jest.fn().mockResolvedValue(change({ added: 0, removed: 1 })),
      get: jest.fn().mockResolvedValue(srv),
    };
    users = { findByIds: jest.fn().mockResolvedValue([]) };
    const config = { get: () => [ADMIN] } as unknown as AppConfigService;
    handler = new AdminHandler(config, servers as never, users as never, i18n);
  });

  const ctx = (extra: Record<string, unknown> = {}) => {
    const c = {
      user: { id: ADMIN, telegramId: 42, language: null },
      locale: 'en',
      t: (key: string, args?: Record<string, string | number>) => i18n.t('en', key, args),
      reply: jest.fn().mockResolvedValue({ chat: { id: 42 }, message_id: 7 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
      api: { editMessageText: jest.fn().mockResolvedValue(true) },
      ...extra,
    };
    return c as typeof c & BotContext;
  };
  const tap = (data: string) => ctx({ callbackQuery: { data } });

  it('only users from ADMIN_USER_IDS are admins', () => {
    expect(handler.isAdmin(ctx())).toBe(true);
    expect(handler.isAdmin(ctx({ user: { id: SRV } }))).toBe(false);
    expect(handler.isAdmin(ctx({ user: undefined }))).toBe(false);
  });

  it('/id shows the users.id', async () => {
    const c = ctx();
    await handler.id(c);
    expect(c.reply).toHaveBeenCalledWith(`Your id: <code>${ADMIN}</code>`, { parse_mode: 'HTML' });
  });

  it('/servers lists servers with a keyboard row per server', async () => {
    const c = ctx();
    await handler.list(c);
    const [text, opts] = c.reply.mock.calls[0] as [
      string,
      { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
    ];
    expect(text).toContain('🟢 <b>sg</b> — 10.0.0.1:440');
    expect(text).toContain('keys on the node: 5');
    expect(opts.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      `srv:off:${SRV}`,
      `srv:sync:${SRV}`,
      `srv:del:${SRV}`,
    ]);
    // Every callback fits Telegram's 64-byte limit.
    for (const row of opts.reply_markup.inline_keyboard) {
      for (const b of row) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    }
  });

  describe('/server_add', () => {
    it('deletes the message with the key, checks the node and reports the result', async () => {
      const c = ctx({ match: 'SG 10.0.0.1 s3cret 8443' });
      await handler.add(c);
      expect(c.deleteMessage).toHaveBeenCalled();
      expect(servers.add).toHaveBeenCalledWith({
        code: 'sg',
        host: '10.0.0.1',
        apiKey: 's3cret',
        apiPort: 8443,
      });
      expect(c.api.editMessageText).toHaveBeenCalledWith(
        42,
        7,
        expect.stringContaining('added and enabled, keys on the node: +2'),
        { parse_mode: 'HTML' },
      );
    });

    it('api_port defaults to 440', async () => {
      await handler.add(ctx({ match: 'sg 10.0.0.1 s3cret' }));
      expect(servers.add).toHaveBeenCalledWith(expect.objectContaining({ apiPort: 440 }));
    });

    it('no arguments → usage, nothing deleted', async () => {
      const c = ctx({ match: '' });
      await handler.add(c);
      expect(c.deleteMessage).not.toHaveBeenCalled();
      expect(c.reply.mock.calls[0][0]).toContain('Format:');
      expect(servers.add).not.toHaveBeenCalled();
    });

    it.each([
      ['s g 10.0.0.1 k', 'api_port'],
      ['sg_1 10.0.0.1 k', 'code'],
      ['sg http://x k', 'host'],
      ['sg 10.0.0.1 k 70000', 'api_port'],
    ])('%p → invalid %s, message still deleted', async (match, field) => {
      const c = ctx({ match });
      await handler.add(c);
      expect(c.deleteMessage).toHaveBeenCalled();
      expect(c.reply.mock.calls[0][0]).toContain(`<b>${field}</b>`);
      expect(servers.add).not.toHaveBeenCalled();
    });

    it('unreachable node → not saved, error shown', async () => {
      servers.add.mockRejectedValue(new ServersAdminError('unreachable', 'connect <refused>'));
      const c = ctx({ match: 'sg 10.0.0.1 k' });
      await handler.add(c);
      const text = c.api.editMessageText.mock.calls[0][2] as string;
      expect(text).toContain('does not respond');
      expect(text).toContain('connect &lt;refused&gt;');
    });
  });

  describe('buttons', () => {
    it('off → disables and shows the result above the list', async () => {
      const c = tap(`srv:off:${SRV}`);
      await handler.onCallback(c);
      expect(c.answerCallbackQuery).toHaveBeenCalled();
      expect(servers.setEnabled).toHaveBeenCalledWith(SRV, false);
      const text = c.editMessageText.mock.lastCall![0] as string;
      expect(text).toMatch(/^⏸ <b>sg<\/b> disabled, keys removed from the node: 4/);
      expect(text).toContain('<b>Servers</b>');
    });

    it('shows a toast and a progress message without buttons before the slow action', async () => {
      const c = tap(`srv:off:${SRV}`);
      let progress: unknown[] | undefined;
      servers.setEnabled.mockImplementation(() => {
        progress = c.editMessageText.mock.calls[0];
        return Promise.resolve(change({ added: 0, removed: 4 }));
      });
      await handler.onCallback(c);
      expect(c.answerCallbackQuery).toHaveBeenCalledWith({ text: '⏳ Working…' });
      expect(progress).toEqual([
        '⏳ Disabling <b>sg</b> and removing keys from the node…',
        { parse_mode: 'HTML', reply_markup: undefined },
      ]);
      expect(c.editMessageText).toHaveBeenCalledTimes(2);
    });

    it('the delete confirmation is instant: no progress step', async () => {
      const c = tap(`srv:del:${SRV}`);
      await handler.onCallback(c);
      expect(c.answerCallbackQuery).toHaveBeenCalledWith();
      expect(c.editMessageText).toHaveBeenCalledTimes(1);
    });

    it('warns when no enabled server is left', async () => {
      servers.setEnabled.mockResolvedValue(change({}, true));
      const c = tap(`srv:off:${SRV}`);
      await handler.onCallback(c);
      expect(c.editMessageText.mock.lastCall![0]).toContain('No enabled servers left');
    });

    it('node down on enable → says keys will be installed on sync', async () => {
      servers.setEnabled.mockResolvedValue(change({ added: 0, error: 'timeout' }));
      const c = tap(`srv:on:${SRV}`);
      await handler.onCallback(c);
      expect(servers.setEnabled).toHaveBeenCalledWith(SRV, true);
      expect(c.editMessageText.mock.lastCall![0]).toContain('keys will be installed on sync');
    });

    it('del asks for confirmation; del! deletes', async () => {
      const ask = tap(`srv:del:${SRV}`);
      await handler.onCallback(ask);
      expect(servers.remove).not.toHaveBeenCalled();
      const [text, opts] = ask.editMessageText.mock.lastCall! as [
        string,
        { reply_markup: { inline_keyboard: { callback_data: string }[][] } },
      ];
      expect(text).toContain('Delete server <b>sg</b>');
      expect(opts.reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
        `srv:del!:${SRV}`,
        'srv:list',
      ]);

      const confirm = tap(`srv:del!:${SRV}`);
      await handler.onCallback(confirm);
      expect(servers.remove).toHaveBeenCalledWith(SRV);
      expect(confirm.editMessageText.mock.lastCall![0]).toContain(
        'deleted, keys removed from the node: 1',
      );
    });

    it('unknown server → "not found" note', async () => {
      servers.syncNow.mockRejectedValue(new ServersAdminError('not_found'));
      const c = tap(`srv:sync:${SRV}`);
      await handler.onCallback(c);
      expect(c.editMessageText.mock.lastCall![0]).toMatch(/^Server not found\./);
    });

    it('refresh with nothing changed is not an error', async () => {
      const c = tap('srv:list');
      c.editMessageText.mockRejectedValue(new Error('Bad Request: message is not modified'));
      await expect(handler.onCallback(c)).resolves.toBeUndefined();
    });
  });

  it('init sets the admin menu in each admin chat, in their language', async () => {
    users.findByIds.mockResolvedValue([{ id: ADMIN, telegramId: 42, language: 'en' }]);
    const setMyCommands = jest.fn().mockResolvedValue(true);
    await handler.init({ api: { setMyCommands } } as never);
    expect(users.findByIds).toHaveBeenCalledWith([ADMIN]);
    const [commands, opts] = setMyCommands.mock.calls[0] as [
      { command: string; description: string }[],
      object,
    ];
    expect(commands.map((c) => c.command)).toEqual([
      'start',
      'help',
      'language',
      'servers',
      'server_add',
    ]);
    expect(commands[3].description).toBe('Servers (admin)');
    expect(opts).toEqual({ scope: { type: 'chat', chat_id: 42 } });
  });
});
