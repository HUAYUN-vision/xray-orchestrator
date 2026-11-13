import type { User } from '../../database/entities';
import { I18nService } from '../../i18n/i18n.service';
import type { BotContext } from '../bot-context';
import { I18nMiddleware } from './i18n.middleware';

describe('I18nMiddleware', () => {
  const middleware = new I18nMiddleware(new I18nService());

  async function run(languageCode?: string, saved?: string | null) {
    const ctx = {
      from: { id: 1, is_bot: false, first_name: 'A', language_code: languageCode },
      user: saved === undefined ? undefined : ({ language: saved } as User),
    } as BotContext;
    const next = jest.fn().mockResolvedValue(undefined);
    await middleware.handle(ctx, next);
    expect(next).toHaveBeenCalled();
    return ctx;
  }

  it("prefers the user's saved language over language_code", async () => {
    expect((await run('en', 'ru')).locale).toBe('ru');
  });

  it('falls back to language_code when nothing is saved', async () => {
    const ctx = await run('en-GB', null);
    expect(ctx.locale).toBe('en');
    expect(ctx.t('language-name')).toBe('English');
  });

  it('ignores an unsupported saved value', async () => {
    expect((await run('en', 'xx')).locale).toBe('en');
  });

  it('uses the default locale when nothing is known', async () => {
    expect((await run()).locale).toBe('ru');
  });

  it('ctx.t follows ctx.locale changes', async () => {
    const ctx = await run();
    ctx.locale = 'en';
    expect(ctx.t('language-name')).toBe('English');
  });
});
