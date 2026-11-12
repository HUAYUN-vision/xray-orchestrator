import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    GLOBAL_PREFIX: z.string().default('api'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGIN: z.string().default('*'),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

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
