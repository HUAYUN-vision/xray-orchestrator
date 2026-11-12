import { I18nService } from '../../src/i18n/i18n.service';
import type { Locale } from '../../src/i18n/i18n.constants';
import type { BotContext } from '../../src/telegram/bot-context';

/** Minimal BotContext for handler unit tests: real translations, mocked reply. */
export function makeCtx(
  i18n: I18nService,
  opts: { locale?: Locale; match?: string; from?: { id: number; first_name?: string } } = {},
) {
  const reply = jest.fn<Promise<unknown>, [string]>().mockResolvedValue(undefined);
  const ctx = {
    reply,
    match: opts.match ?? '',
    from: opts.from ?? { id: 1, first_name: 'Ann' },
    locale: opts.locale ?? 'ru',
  } as unknown as BotContext;
  ctx.t = (key, args) => i18n.t(ctx.locale, key, args);
  return { ctx, reply };
}
