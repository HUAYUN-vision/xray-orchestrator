import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { Currency } from '../../database/enums';
import { CbrClient } from './cbr.client';

/** Isolated config: 20 places for intermediate division, results are rounded explicitly. */
const BN = BigNumber.clone({ DECIMAL_PLACES: 20 });

/** Balance precision, matches numeric(20,8) in the database. */
export const MONEY_SCALE = 8;

const TTL_MS = 60 * 60 * 1000;
/** If CBR is down, older rates are still used for this long (covers weekends and holidays). */
const MAX_STALE_MS = 72 * 60 * 60 * 1000;

export interface RatesSnapshot {
  /** CBR rates date (YYYY-MM-DD). */
  date: string;
  fetchedAt: Date;
  /** Rubles per 1 unit of each balance currency. */
  rubPerUnit: Record<Currency, string>;
}

export interface Conversion {
  /** Converted amount, 8 decimal places. */
  amount: string;
  /** Units of `to` per 1 unit of `from`. */
  rate: string;
  ratesDate: string;
}

export class RatesUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Exchange rates are unavailable: ${String(cause)}`);
    this.name = 'RatesUnavailableError';
  }
}

/**
 * Currency conversion as in passimx-vpn-bot: CBR rates for USD and CNY in rubles, USDT = USD.
 * Rates are cached for an hour and fetched lazily.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private snapshot?: RatesSnapshot;
  private inflight?: Promise<RatesSnapshot>;

  constructor(private readonly cbr: CbrClient) {}

  async getSnapshot(): Promise<RatesSnapshot> {
    const age = this.snapshot ? Date.now() - this.snapshot.fetchedAt.getTime() : Infinity;
    if (this.snapshot && age < TTL_MS) return this.snapshot;

    try {
      this.inflight ??= this.fetch().finally(() => (this.inflight = undefined));
      this.snapshot = await this.inflight;
      return this.snapshot;
    } catch (err) {
      if (this.snapshot && age < MAX_STALE_MS) {
        this.logger.warn(
          `CBR fetch failed, using rates from ${this.snapshot.date}: ${String(err)}`,
        );
        return this.snapshot;
      }
      throw new RatesUnavailableError(err);
    }
  }

  /**
   * Converts `amount` (decimal string) from one currency to another.
   * Rounding to 8 places: `down` when crediting the user, `up` when charging.
   */
  async convert(
    amount: string,
    from: Currency,
    to: Currency,
    rounding: 'down' | 'up' = 'down',
  ): Promise<Conversion> {
    const value = parseAmount(amount);

    const { rubPerUnit, date } = await this.getSnapshot();
    const rate = new BN(rubPerUnit[from]).div(rubPerUnit[to]);
    const mode = rounding === 'up' ? BigNumber.ROUND_UP : BigNumber.ROUND_DOWN;

    return {
      amount: value.times(rate).decimalPlaces(MONEY_SCALE, mode).toFixed(MONEY_SCALE),
      rate: rate.decimalPlaces(12, BigNumber.ROUND_HALF_UP).toFixed(),
      ratesDate: date,
    };
  }

  private async fetch(): Promise<RatesSnapshot> {
    const { date, rubPerUnit } = await this.cbr.fetchDaily();
    const usd = rubPerUnit.USD;
    const cny = rubPerUnit.CNY;
    for (const [code, v] of [
      ['USD', usd],
      ['CNY', cny],
    ] as const) {
      if (!v || !new BN(v).isGreaterThan(0)) throw new Error(`CBR: no valid ${code} rate`);
    }
    this.logger.log(`Rates for ${date}: USD=${usd} RUB, CNY=${cny} RUB`);
    return {
      date,
      fetchedAt: new Date(),
      rubPerUnit: { [Currency.RUB]: '1', [Currency.USDT]: usd, [Currency.CNY]: cny },
    };
  }
}

function parseAmount(amount: string): BigNumber {
  let value: BigNumber;
  try {
    value = new BN(amount);
  } catch {
    throw new RangeError(`Invalid amount: ${amount}`);
  }
  if (!value.isFinite() || value.isNegative()) throw new RangeError(`Invalid amount: ${amount}`);
  return value;
}
