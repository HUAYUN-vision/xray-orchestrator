import { validateEnv } from './env.validation';

const BOT_TOKEN = '123456:test-token';

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv({ BOT_TOKEN });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.BOT_MODE).toBe('polling');
  });

  it('coerces values', () => {
    const env = validateEnv({ BOT_TOKEN, PORT: '8080', SWAGGER_ENABLED: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('throws on invalid values', () => {
    expect(() => validateEnv({ BOT_TOKEN, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('requires a well-formed BOT_TOKEN', () => {
    expect(() => validateEnv({})).toThrow(/BOT_TOKEN/);
    expect(() => validateEnv({ BOT_TOKEN: 'garbage' })).toThrow(/BOT_TOKEN/);
  });

  it('requires WEBHOOK_URL and WEBHOOK_SECRET in webhook mode', () => {
    expect(() => validateEnv({ BOT_TOKEN, BOT_MODE: 'webhook' })).toThrow(
      /WEBHOOK_URL[\s\S]*WEBHOOK_SECRET/,
    );
  });

  it('accepts a complete webhook config', () => {
    const env = validateEnv({
      BOT_TOKEN,
      BOT_MODE: 'webhook',
      WEBHOOK_URL: 'https://bot.example.com/api/telegram/webhook',
      WEBHOOK_SECRET: 's3cret_value',
    });
    expect(env.BOT_MODE).toBe('webhook');
  });

  it('rejects a non-https WEBHOOK_URL', () => {
    expect(() =>
      validateEnv({
        BOT_TOKEN,
        BOT_MODE: 'webhook',
        WEBHOOK_URL: 'http://bot.example.com/hook',
        WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow(/WEBHOOK_URL/);
  });
});
