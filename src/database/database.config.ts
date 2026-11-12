import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

// ts-node / ts-jest load .ts sources, the compiled app loads .js (and must skip .d.ts).
const MIGRATIONS_GLOB = join(__dirname, 'migrations', __filename.endsWith('.ts') ? '*.ts' : '*.js');

/** Shared TypeORM options for the Nest app, the migration CLI and DB tests. */
export function buildDataSourceOptions(
  url: string,
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: [MIGRATIONS_GLOB],
    migrationsTableName: 'migrations',
    // Schema changes go through migrations only.
    synchronize: false,
    ...overrides,
  } as DataSourceOptions;
}
