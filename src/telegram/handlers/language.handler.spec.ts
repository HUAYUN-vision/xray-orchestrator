import { I18nService } from '../../i18n/i18n.service';
import type { UsersRepository } from '../../database/repositories/users.repository';
import { InMemoryUsersRepository } from '../../../test/helpers/in-memory-users.repository';
import { makeCtx } from '../../../test/helpers/make-ctx';
import { LanguageHandler } from './language.handler';
import type { WidgetHandler } from './widget.handler';

describe('LanguageHandler', () => {
  const i18n = new I18nService();
  let users: InMemoryUsersRepository;
  let handler: LanguageHandler;
  let sendHome: jest.Mock;

  beforeEach(() => {
    users = new InMemoryUsersRepository();
    sendHome = jest.fn().mockResolvedValue(undefined);
    handler = new LanguageHandler(
      i18n,
      users as unknown as UsersRepository,
      {
        sendHome,
      } as unknown as WidgetHandler,
    );
  });

  async function ctxFor(match: string) {
    const user = await users.syncFromTelegram({ telegramId: 5, username: null, firstName: 'A' });
    const res = makeCtx(i18n, { match, from: { id: 5 } });
    res.ctx.user = user;
    return res;
  }

  it('without an argument shows the current language and the list', async () => {
    const { ctx, reply } = await ctxFor('');
    await handler.language(ctx);
    const text = reply.mock.calls[0][0];
    expect(text).toContain('Текущий язык: Русский');
    expect(text).toContain('en — English');
    expect(text).toContain('ru — Русский');
  });

  it('switches, saves and answers in the new language', async () => {
    const { ctx, reply } = await ctxFor(' EN ');
    await handler.language(ctx);
    expect((await users.findByTelegramId(5))?.language).toBe('en');
    expect(ctx.locale).toBe('en');
    expect(reply).toHaveBeenCalledWith('Language switched to English.');
    expect(sendHome).toHaveBeenCalledWith(ctx);
  });

  it('rejects an unknown language and keeps the current one', async () => {
    const { ctx, reply } = await ctxFor('de');
    await handler.language(ctx);
    expect((await users.findByTelegramId(5))?.language).toBeNull();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('«de»'));
  });
});
