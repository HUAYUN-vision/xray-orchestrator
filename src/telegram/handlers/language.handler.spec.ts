import { I18nService } from '../../i18n/i18n.service';
import { InMemoryLocaleStore } from '../../i18n/locale-store';
import { LanguageHandler } from './language.handler';
import { makeCtx } from '../../../test/helpers/make-ctx';

describe('LanguageHandler', () => {
  const i18n = new I18nService();
  let store: InMemoryLocaleStore;
  let handler: LanguageHandler;

  beforeEach(() => {
    store = new InMemoryLocaleStore();
    handler = new LanguageHandler(i18n, store);
  });

  it('without an argument shows the current language and the list', async () => {
    const { ctx, reply } = makeCtx(i18n);
    await handler.language(ctx);
    const text = reply.mock.calls[0][0];
    expect(text).toContain('Текущий язык: Русский');
    expect(text).toContain('en — English');
    expect(text).toContain('ru — Русский');
  });

  it('switches, saves and answers in the new language', async () => {
    const { ctx, reply } = makeCtx(i18n, { match: ' EN ', from: { id: 5 } });
    await handler.language(ctx);
    expect(await store.get(5)).toBe('en');
    expect(ctx.locale).toBe('en');
    expect(reply).toHaveBeenCalledWith('Language switched to English.');
  });

  it('rejects an unknown language and keeps the current one', async () => {
    const { ctx, reply } = makeCtx(i18n, { match: 'de', from: { id: 5 } });
    await handler.language(ctx);
    expect(await store.get(5)).toBeUndefined();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('«de»'));
  });
});
