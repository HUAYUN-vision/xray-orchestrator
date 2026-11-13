import { Currency } from '../database/enums';
import { parseCommand } from './widget-state';

const ID = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';

describe('parseCommand', () => {
  it.each([
    ['h', { c: 'home' }],
    ['b', { c: 'tariffs' }],
    [`t:${ID}`, { c: 'pay', tariffId: ID }],
    [`k:${ID}`, { c: 'key', keyId: ID }],
    [`l:${ID}`, { c: 'link', keyId: ID }],
    [
      `p:${ID}:usdt:12345:2.41`,
      { c: 'buy', tariffId: ID, currency: Currency.USDT, seqno: 12345, amount: '2.41' },
    ],
  ])('%s', (data, expected) => {
    expect(parseCommand(data)).toEqual(expected);
  });

  it('a purchase command fits the 64-byte request limit', () => {
    expect(Buffer.byteLength(`p:${ID}:usdt:999999999:999999.99`)).toBeLessThanOrEqual(64);
  });

  it.each([
    '',
    'x',
    `t:${ID.toUpperCase()}`,
    `k:${ID}x`,
    `l:${ID}x`,
    `p:${ID}:eur:1:1`,
    `p:${ID}:rub:1:1.001`,
    `p:${ID}:rub:-1:1`,
    `p:not-a-uuid:rub:1:1`,
  ])('rejects %p', (data) => {
    expect(parseCommand(data)).toBeNull();
  });
});
