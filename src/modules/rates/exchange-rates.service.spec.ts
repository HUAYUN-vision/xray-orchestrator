import { Logger } from '@nestjs/common';
import { Currency } from '../../database/enums';
import type { CbrRates } from './cbr.client';
import { ExchangeRatesService, RatesUnavailableError } from './exchange-rates.service';

const RATES: CbrRates = {
  date: '2026-11-12',
  rubPerUnit: { USD: '82.6617', CNY: '12.3907', AUD: '56.8547' },
};
const HOUR = 60 * 60 * 1000;

describe('ExchangeRatesService', () => {
  let fetchDaily: jest.Mock<Promise<CbrRates>, []>;
  let service: ExchangeRatesService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z'), doNotFake: ['nextTick'] });
    fetchDaily = jest.fn().mockResolvedValue(RATES);
    service = new ExchangeRatesService({ fetchDaily });
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    // [amount, from, to, rounding, expected]
    ['199', Currency.RUB, Currency.RUB, 'down', '199.00000000'],
    ['82.6617', Currency.RUB, Currency.USDT, 'down', '1.00000000'],
    ['1', Currency.USDT, Currency.RUB, 'down', '82.66170000'],
    ['1', Currency.CNY, Currency.RUB, 'down', '12.39070000'],
    // 199 RUB in CNY = 199 / 12.3907 = 16.0604324211...
    ['199', Currency.RUB, Currency.CNY, 'down', '16.06043242'],
    ['199', Currency.RUB, Currency.CNY, 'up', '16.06043243'],
    // 1 CNY in USDT = 12.3907 / 82.6617 = 0.14989646...
    ['1', Currency.CNY, Currency.USDT, 'down', '0.14989650'],
  ] as const)('%s %s → %s (%s) = %s', async (amount, from, to, rounding, expected) => {
    await expect(service.convert(amount, from, to, rounding)).resolves.toMatchObject({
      amount: expected,
      ratesDate: '2026-11-12',
    });
  });

  it('returns the rate used', async () => {
    const res = await service.convert('1', Currency.USDT, Currency.CNY);
    expect(res.rate).toBe('6.671269581218');
  });

  it('rejects invalid amounts', async () => {
    await expect(service.convert('-1', Currency.RUB, Currency.CNY)).rejects.toThrow(RangeError);
    await expect(service.convert('abc', Currency.RUB, Currency.CNY)).rejects.toThrow(RangeError);
  });

  it('caches rates for an hour and shares one in-flight request', async () => {
    await Promise.all([service.getSnapshot(), service.getSnapshot()]);
    jest.advanceTimersByTime(HOUR - 1);
    await service.getSnapshot();
    expect(fetchDaily).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2);
    await service.getSnapshot();
    expect(fetchDaily).toHaveBeenCalledTimes(2);
  });

  it('keeps using stale rates when CBR is down, up to 72 hours', async () => {
    await service.getSnapshot();
    fetchDaily.mockRejectedValue(new Error('ddos-guard'));

    jest.advanceTimersByTime(48 * HOUR);
    await expect(service.getSnapshot()).resolves.toMatchObject({ date: '2026-11-12' });

    jest.advanceTimersByTime(25 * HOUR);
    await expect(service.getSnapshot()).rejects.toThrow(RatesUnavailableError);
  });

  it('fails without any rates', async () => {
    fetchDaily.mockRejectedValue(new Error('network'));
    await expect(service.convert('1', Currency.RUB, Currency.CNY)).rejects.toThrow(
      RatesUnavailableError,
    );
  });

  it('rejects a response without USD or CNY', async () => {
    fetchDaily.mockResolvedValue({ date: '2026-11-12', rubPerUnit: { USD: '82.6617' } });
    await expect(service.getSnapshot()).rejects.toThrow(/no valid CNY rate/);
  });
});
