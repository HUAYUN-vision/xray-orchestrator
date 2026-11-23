import { Currency } from '../../database/enums';

export const SYMBOL: Record<Currency, string> = {
  [Currency.RUB]: '₽',
  [Currency.CNY]: '¥',
  [Currency.USDT]: 'USDT',
};

/** `300 ₽`, `10 ¥`, `2.41 USDT`. */
export function money(amount: string, currency: Currency): string {
  return `${amount} ${SYMBOL[currency]}`;
}

/** `dd.mm.yyyy` (UTC) from unix seconds. */
export function date(unix: number): string {
  const d = new Date(unix * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Escapes text for `parse_mode: HTML`. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
