import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

/** Shared TypeORM options for the Nest app and DB tests. */
export function buildDataSourceOptions(
  url: string,
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    // No migrations: the schema follows the entities on every start.
    synchronize: true,
    // gen_random_uuid() is built into Postgres 13+, no extension needed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    ...overrides,
  } as DataSourceOptions;
}
