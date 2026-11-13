import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Injectable } from '@nestjs/common';
import type { Locale } from '../i18n/i18n.constants';
import { I18nService } from '../i18n/i18n.service';
import { WIDGET_LIMITS } from '../telegram/types/widget';

const TEMPLATE = join(__dirname, 'widget.html');
const STRINGS_PREFIX = 'w-';

export interface RenderedWidget {
  html: string;
  bytes: number;
  compressedBytes: number;
}

/**
 * Renders the widget HTML for a locale: the template with `w-*` strings embedded.
 * HTML is immutable after sending, so a language change means sending a new widget.
 */
@Injectable()
export class WidgetRendererService {
  private readonly template = minify(readFileSync(TEMPLATE, 'utf8'));
  private readonly cache = new Map<Locale, RenderedWidget>();

  constructor(private readonly i18n: I18nService) {}

  render(locale: Locale): RenderedWidget {
    let rendered = this.cache.get(locale);
    if (!rendered) {
      rendered = this.build(locale);
      this.cache.set(locale, rendered);
    }
    return rendered;
  }

  private build(locale: Locale): RenderedWidget {
    const strings: Record<string, string> = {};
    for (const key of this.i18n.keys(locale)) {
      if (key.startsWith(STRINGS_PREFIX)) {
        strings[key.slice(STRINGS_PREFIX.length)] = this.i18n.t(locale, key);
      }
    }
    // `<` is escaped so a string can never close the <script> tag.
    const json = JSON.stringify(strings).replace(/</g, '\\u003c');
    const html = this.template.replace('__I18N__', () => json);

    const bytes = Buffer.byteLength(html, 'utf8');
    const compressedBytes = deflateSync(html, { level: 9 }).length;
    if (bytes > WIDGET_LIMITS.htmlBytes || compressedBytes > WIDGET_LIMITS.htmlCompressedBytes) {
      throw new RangeError(
        `Widget HTML (${locale}) is ${bytes} B / ${compressedBytes} B compressed, ` +
          `limits ${WIDGET_LIMITS.htmlBytes} / ${WIDGET_LIMITS.htmlCompressedBytes}`,
      );
    }
    return { html, bytes, compressedBytes };
  }
}

/** Drops indentation, blank lines and full-line `//` comments. Newlines stay (no ASI surprises). */
function minify(html: string): string {
  return html
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}
