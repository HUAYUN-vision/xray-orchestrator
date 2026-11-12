/**
 * Data source for the TypeORM CLI (`npm run migration:*`). The app itself uses DatabaseModule.
 * Reads DATABASE_URL from the environment or from `.env`.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database.config';

try {
  process.loadEnvFile();
} catch {
  // no .env: rely on the real environment
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export default new DataSource(buildDataSourceOptions(url));
