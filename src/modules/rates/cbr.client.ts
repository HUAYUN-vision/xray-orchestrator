import { Injectable } from '@nestjs/common';

const CBR_DAILY_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';

/** Official CBR rates: how many rubles one unit of the currency costs. */
export interface CbrRates {
  /** Date the rates are set for, as published by CBR (YYYY-MM-DD). */
  date: string;
  /** e.g. `{ USD: '82.6617', CNY: '12.3907' }` */
  rubPerUnit: Record<string, string>;
}

/** Client for the Central Bank of Russia daily rates (XML, windows-1251). */
@Injectable()
export class CbrClient {
  async fetchDaily(timeoutMs = 10_000): Promise<CbrRates> {
    const res = await fetch(CBR_DAILY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`CBR responded ${res.status}`);
    const xml = new TextDecoder('windows-1251').decode(await res.arrayBuffer());
    return parseCbrDaily(xml);
  }
}

/** Parses XML_daily.asp. Uses VunitRate (rate per 1 unit), so Nominal does not matter. */
export function parseCbrDaily(xml: string): CbrRates {
  const dateMatch = /<ValCurs[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!dateMatch) throw new Error('CBR XML: no ValCurs date');
  const [, dd, mm, yyyy] = dateMatch;

  const rubPerUnit: Record<string, string> = {};
  for (const [, block] of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
    const code = /<CharCode>([A-Z]{3})<\/CharCode>/.exec(block)?.[1];
    const rate = /<VunitRate>([\d,]+)<\/VunitRate>/.exec(block)?.[1];
    if (code && rate) rubPerUnit[code] = rate.replace(',', '.');
  }
  if (Object.keys(rubPerUnit).length === 0) throw new Error('CBR XML: no rates');

  return { date: `${yyyy}-${mm}-${dd}`, rubPerUnit };
}
