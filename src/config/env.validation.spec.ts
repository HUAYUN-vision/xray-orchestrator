import { validateEnv } from './env.validation';

const BOT_TOKEN = '123456:test-token';
const DATABASE_URL = 'postgres://app:app@localhost:5432/app';
const base = { BOT_TOKEN, DATABASE_URL };

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.BOT_MODE).toBe('polling');
  });

  it('coerces values', () => {
    const env = validateEnv({ ...base, PORT: '8080', SWAGGER_ENABLED: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('parses ADMIN_USER_IDS as a uuid list', () => {
    expect(validateEnv(base).ADMIN_USER_IDS).toEqual([]);
    const a = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
    const b = '11111111-1111-4111-8111-111111111111';
    expect(
      validateEnv({ ...base, ADMIN_USER_IDS: ` ${a.toUpperCase()}, ${b},` }).ADMIN_USER_IDS,
    ).toEqual([a, b]);
    expect(() => validateEnv({ ...base, ADMIN_USER_IDS: '42' })).toThrow(/ADMIN_USER_IDS/);
  });

  it('throws on invalid values', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires a well-formed BOT_TOKEN', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/BOT_TOKEN/);
    expect(() => validateEnv({ ...base, BOT_TOKEN: 'garbage' })).toThrow(/BOT_TOKEN/);
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => validateEnv({ BOT_TOKEN })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
    expect(validateEnv(base).DB_LOGGING).toBe(false);
  });

  it('requires WEBHOOK_URL and WEBHOOK_SECRET in webhook mode', () => {
    expect(() => validateEnv({ ...base, BOT_MODE: 'webhook' })).toThrow(
      /WEBHOOK_URL[\s\S]*WEBHOOK_SECRET/,
    );
  });

  it('accepts a complete webhook config', () => {
    const env = validateEnv({
      ...base,
      BOT_MODE: 'webhook',
      WEBHOOK_URL: 'https://bot.example.com/api/telegram/webhook',
      WEBHOOK_SECRET: 's3cret_value',
    });
    expect(env.BOT_MODE).toBe('webhook');
  });

  it('rejects a non-https WEBHOOK_URL', () => {
    expect(() =>
      validateEnv({
        ...base,
        BOT_MODE: 'webhook',
        WEBHOOK_URL: 'http://bot.example.com/hook',
        WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow(/WEBHOOK_URL/);
  });

  describe('payments', () => {
    const payments = {
      PAYMENTS_URL: 'http://payments:3000/',
      PAYMENTS_API_KEY: 'k'.repeat(32),
      PUBLIC_URL: 'https://bot.example.com',
    };

    it('is off by default, with preset amounts', () => {
      const env = validateEnv(base);
      expect(env.PAYMENTS_URL).toBeUndefined();
      expect(env.TOPUP_PRESETS_RUB).toEqual(['100', '300', '500', '1000']);
      expect(env.TOPUP_PRESETS_CNY).toEqual(['10', '30', '50', '100']);
    });

    it('accepts a complete config and trims the trailing slash', () => {
      expect(validateEnv({ ...base, ...payments }).PAYMENTS_URL).toBe('http://payments:3000');
    });

    it('requires URL and key together, and PUBLIC_URL for the callback', () => {
      expect(() => validateEnv({ ...base, PAYMENTS_URL: payments.PAYMENTS_URL })).toThrow(
        /PAYMENTS_API_KEY/,
      );
      expect(() => validateEnv({ ...base, ...payments, PUBLIC_URL: undefined })).toThrow(
        /PUBLIC_URL/,
      );
    });

    it('parses presets; empty turns a currency off; rejects bad amounts', () => {
      const env = validateEnv({ ...base, TOPUP_PRESETS_RUB: ' 150, 99.5 ', TOPUP_PRESETS_CNY: '' });
      expect(env.TOPUP_PRESETS_RUB).toEqual(['150', '99.5']);
      expect(env.TOPUP_PRESETS_CNY).toEqual([]);
      expect(() => validateEnv({ ...base, TOPUP_PRESETS_RUB: '0' })).toThrow(/TOPUP_PRESETS_RUB/);
      expect(() => validateEnv({ ...base, TOPUP_PRESETS_RUB: '1.234' })).toThrow();
      expect(() => validateEnv({ ...base, TOPUP_PRESETS_RUB: '1,2,3,4,5,6,7' })).toThrow();
    });

    it('custom amount range: defaults, min ≤ max', () => {
      const env = validateEnv(base);
      expect([env.TOPUP_MIN_RUB, env.TOPUP_MAX_RUB]).toEqual(['100', '100000']);
      expect([env.TOPUP_MIN_CNY, env.TOPUP_MAX_CNY]).toEqual(['10', '10000']);
      expect(validateEnv({ ...base, TOPUP_MIN_RUB: ' 50.5 ' }).TOPUP_MIN_RUB).toBe('50.5');
      expect(() => validateEnv({ ...base, TOPUP_MIN_CNY: '500', TOPUP_MAX_CNY: '100' })).toThrow(
        /TOPUP_MAX_CNY/,
      );
      expect(() => validateEnv({ ...base, TOPUP_MIN_RUB: '0' })).toThrow(/TOPUP_MIN_RUB/);
    });
  });
});
