import type { ValueTransformer } from 'typeorm';

/**
 * pg returns `bigint` as a string. Telegram ids and byte counters fit into 53 bits
 * (Number.MAX_SAFE_INTEGER), so they are safe to keep as numbers.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/** numeric(20,8): 12 integer digits, 8 fractional (enough for USDT and fiat). */
export const MONEY = { type: 'numeric', precision: 20, scale: 8 } as const;
