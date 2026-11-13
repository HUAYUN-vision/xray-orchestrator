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
});
