import { z } from 'zod';

/** Comma-separated amounts, up to 2 decimals, at most 6 (widget space); stored as strings. */
function presets(defaults: string) {
  return z
    .string()
    .default(defaults)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          z
            .string()
            .regex(/^[1-9]\d{0,6}(?:\.\d{1,2})?$/, 'amount like 100 or 99.5, from 1 to 9999999'),
        )
        .max(6),
    );
}

/** One amount, up to 2 decimals; stored as a string. */
function amount(defaults: string) {
  return z
    .string()
    .trim()
    .default(defaults)
    .pipe(z.string().regex(/^[1-9]\d{0,6}(?:\.\d{1,2})?$/, 'amount like 100 or 99.5'));
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    GLOBAL_PREFIX: z.string().default('api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGIN: z.string().default('*'),
    /** Public https base URL of this service, used in subscription links. */
    PUBLIC_URL: z
      .url({ protocol: /^https$/ })
      .transform((u) => u.replace(/\/+$/, ''))
      .optional(),
    /** Admins: `users.id` (uuid, not Telegram id), comma-separated. Empty — no admin commands. */
    ADMIN_USER_IDS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.uuid())),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Database
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_LOGGING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Xray nodes (xray-server-instance)
    XRAY_NODE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

    // Top-up via payments-service (D20). Without URL and key, top-up is off.
    PAYMENTS_URL: z
      .url({ protocol: /^https?$/ })
      .transform((u) => u.replace(/\/+$/, ''))
      .optional(),
    PAYMENTS_API_KEY: z.string().min(16).optional(),
    PAYMENTS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    /** Top-up amounts on the widget buttons; empty — the currency is not offered. */
    TOPUP_PRESETS_RUB: presets('100,300,500,1000'),
    TOPUP_PRESETS_CNY: presets('10,30,50,100'),
    /** Range of a custom amount typed by the user. */
    TOPUP_MIN_RUB: amount('100'),
    TOPUP_MAX_RUB: amount('100000'),
    TOPUP_MIN_CNY: amount('10'),
    TOPUP_MAX_CNY: amount('10000'),

    // Telegram
    BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/, 'must look like "<id>:<secret>"'),
    BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
    WEBHOOK_URL: z.url({ protocol: /^https$/ }).optional(),
    WEBHOOK_SECRET: z
      .string()
      .regex(/^[\w-]{1,256}$/, 'only A-Z, a-z, 0-9, _ and -, up to 256 chars')
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.PAYMENTS_URL !== !env.PAYMENTS_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: [env.PAYMENTS_URL ? 'PAYMENTS_API_KEY' : 'PAYMENTS_URL'],
        message: 'PAYMENTS_URL and PAYMENTS_API_KEY are set together',
      });
    }
    for (const c of ['RUB', 'CNY'] as const) {
      if (Number(env[`TOPUP_MIN_${c}`]) > Number(env[`TOPUP_MAX_${c}`])) {
        ctx.addIssue({
          code: 'custom',
          path: [`TOPUP_MAX_${c}`],
          message: `must be at least TOPUP_MIN_${c}`,
        });
      }
    }
    if (env.PAYMENTS_URL && !env.PUBLIC_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message: 'required with PAYMENTS_URL: payments-service sends the callback there',
      });
    }
    if (env.BOT_MODE !== 'webhook') return;
    for (const key of ['WEBHOOK_URL', 'WEBHOOK_SECRET'] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'required when BOT_MODE=webhook' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
