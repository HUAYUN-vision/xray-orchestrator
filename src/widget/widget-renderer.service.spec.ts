import { I18nService } from '../i18n/i18n.service';
import { WIDGET_LIMITS } from '../telegram/types/widget';
import { WidgetRendererService } from './widget-renderer.service';

describe('WidgetRendererService', () => {
  const renderer = new WidgetRendererService(new I18nService());

  it.each(['ru', 'en'] as const)('%s fits the HTML limits', (locale) => {
    const { html, bytes, compressedBytes } = renderer.render(locale);
    expect(bytes).toBeLessThanOrEqual(WIDGET_LIMITS.htmlBytes);
    expect(compressedBytes).toBeLessThanOrEqual(WIDGET_LIMITS.htmlCompressedBytes);
    expect(html).not.toContain('__I18N__');
    expect(html).not.toContain('\0');
  });

  it('embeds only w-* strings of the locale, without the prefix', () => {
    const { html } = renderer.render('en');
    expect(html).toContain('"buy":"Buy a key"');
    expect(html).toContain('"m-funds":"Insufficient funds"');
    expect(html).not.toContain('language-name');
    expect(renderer.render('ru').html).toContain('"buy":"Купить ключ"');
  });

  it('caches the result per locale', () => {
    expect(renderer.render('ru')).toBe(renderer.render('ru'));
  });
});
