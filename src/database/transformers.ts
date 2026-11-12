import type { ValueTransformer } from 'typeorm';

/**
 * pg returns `bigint` as a string. Telegram ids fit into 52 bits
 * (Number.MAX_SAFE_INTEGER), so they are safe to keep as numbers.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
