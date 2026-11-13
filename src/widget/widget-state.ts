import { Currency } from '../database/enums';

/**
 * Widget state (`chat_data`, ≤ 1 KB) and commands (`request` data, ≤ 64 B).
 * Short keys to stay within the limits; widget.html reads exactly these fields.
 */

/** Message shown on top of the screen; text is `w-m-<code>`. */
export type WidgetMessage =
  | 'ok'
  | 'funds'
  | 'stale'
  | 'price'
  | 'rates'
  | 'srv'
  | 'fail'
  | 'tariff'
  | 'gone'
  | 'link'
  | 'err';

export type Balances = Record<Currency, string>;

interface Base {
  /** Changes on every update, so editMessageWidgetData never gets "not modified". */
  n: number;
  m?: WidgetMessage;
}

/** Home: balances and keys `[id, expiresAt (unix s), active 1/0]`. */
export interface HomeState extends Base {
  s: 'h';
  b: Balances;
  k: [string, number, 0 | 1][];
}

/** Tariffs: `[id, days, price, currency]`. */
export interface TariffsState extends Base {
  s: 'b';
  t: [string, number, string, Currency][];
}

/** Payment: tariff, balance seqno, balances and price per currency `[currency, amount]`. */
export interface PayState extends Base {
  s: 't';
  i: string;
  d: number;
  q: number;
  b: Balances;
  o: [Currency, string][];
}

/**
 * Key: id, expiresAt, active, `u: 1` if a subscription link can be sent.
 * The link itself is not in chat_data: widget messages are protected and copyText
 * does not work there, so the bot sends the link as a regular message (D17).
 */
export interface KeyState extends Base {
  s: 'k';
  i: string;
  e: number;
  a: 0 | 1;
  u?: 1;
}

export type WidgetState = HomeState | TariffsState | PayState | KeyState;

export type WidgetCommand =
  | { c: 'home' }
  | { c: 'tariffs' }
  | { c: 'pay'; tariffId: string }
  | { c: 'buy'; tariffId: string; currency: Currency; seqno: number; amount: string }
  | { c: 'key'; keyId: string }
  | { c: 'link'; keyId: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CURRENCY = Object.values(Currency).join('|');
const BUY_RE = new RegExp(`^p:(${UUID}):(${CURRENCY}):(\\d{1,9}):(\\d{1,12}(?:\\.\\d{1,2})?)$`);
const PAY_RE = new RegExp(`^t:(${UUID})$`);
const KEY_RE = new RegExp(`^k:(${UUID})$`);
const LINK_RE = new RegExp(`^l:(${UUID})$`);

/** Parses a command from the widget; `null` for anything unexpected. */
export function parseCommand(data: string): WidgetCommand | null {
  if (data === 'h') return { c: 'home' };
  if (data === 'b') return { c: 'tariffs' };
  let m = PAY_RE.exec(data);
  if (m) return { c: 'pay', tariffId: m[1] };
  m = KEY_RE.exec(data);
  if (m) return { c: 'key', keyId: m[1] };
  m = LINK_RE.exec(data);
  if (m) return { c: 'link', keyId: m[1] };
  m = BUY_RE.exec(data);
  if (m) {
    return {
      c: 'buy',
      tariffId: m[1],
      currency: m[2] as Currency,
      seqno: Number(m[3]),
      amount: m[4],
    };
  }
  return null;
}
