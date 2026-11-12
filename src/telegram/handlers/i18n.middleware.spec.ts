import { I18nService } from '../../i18n/i18n.service';
import { InMemoryLocaleStore } from '../../i18n/locale-store';
import type { BotContext } from '../bot-context';
import { I18nMiddleware } from './i18n.middleware';

describe('I18nMiddleware', () => {
  const i18n = new I18nService();

  async function run(from: BotContext['from'], saved?: 'ru' | 'en') {
    const store = new InMemoryLocaleStore();
    if (from && saved) await store.set(from.id, saved);
    const ctx = { from } as BotContext;
    const next = jest.fn().mockResolvedValue(undefined);
    await new I18nMiddleware(i18n, store).handle(ctx, next);
    expect(next).toHaveBeenCalled();
    return ctx;
  }

  it('prefers the saved choice over language_code', async () => {
    const ctx = await run({ id: 1, is_bot: false, first_name: 'A', language_code: 'en' }, 'ru');
    expect(ctx.locale).toBe('ru');
  });

  it('falls back to language_code', async () => {
    const ctx = await run({ id: 1, is_bot: false, first_name: 'A', language_code: 'en-GB' });
    expect(ctx.locale).toBe('en');
    expect(ctx.t('language-name')).toBe('English');
  });

  it('uses the default locale for updates without a user', async () => {
    const ctx = await run(undefined);
    expect(ctx.locale).toBe('ru');
  });

  it('ctx.t follows ctx.locale changes', async () => {
    const ctx = await run({ id: 1, is_bot: false, first_name: 'A' });
    ctx.locale = 'en';
    expect(ctx.t('language-name')).toBe('English');
  });
});
