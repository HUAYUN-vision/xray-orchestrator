import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/database.config';
import { User } from '../../src/database/entities';
import { UsersRepository } from '../../src/database/repositories/users.repository';

/** Runs against a real Postgres in Docker: migrations, schema sync and repository queries. */
describe('UsersRepository (db)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let users: UsersRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    dataSource = await new DataSource(
      buildDataSourceOptions(container.getConnectionUri()),
    ).initialize();
    await dataSource.runMigrations();
    users = new UsersRepository(dataSource.getRepository(User));
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE users RESTART IDENTITY');
  });

  it('migrations match the entities', async () => {
    const sql = await dataSource.driver.createSchemaBuilder().log();
    expect(sql.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('creates a user on first sync and returns telegram_id as a number', async () => {
    const user = await users.syncFromTelegram({
      telegramId: 7_000_000_001,
      username: 'ann',
      firstName: 'Ann',
    });
    expect(user).toMatchObject({ id: 1, telegramId: 7_000_000_001, language: null });
    expect(typeof user.telegramId).toBe('number');
  });

  it('updates the profile on change and keeps the same row', async () => {
    const first = await users.syncFromTelegram({ telegramId: 1, username: null, firstName: 'A' });
    const second = await users.syncFromTelegram({ telegramId: 1, username: 'a', firstName: 'B' });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ username: 'a', firstName: 'B' });
    expect(await dataSource.getRepository(User).count()).toBe(1);
  });

  it('survives concurrent first syncs of the same user', async () => {
    const profile = { telegramId: 2, username: null, firstName: 'C' };
    const [a, b] = await Promise.all([
      users.syncFromTelegram(profile),
      users.syncFromTelegram(profile),
    ]);
    expect(a.id).toBe(b.id);
  });

  it('keeps the chosen language across syncs', async () => {
    await users.syncFromTelegram({ telegramId: 3, username: null, firstName: 'D' });
    await users.setLanguage(3, 'en');
    const user = await users.syncFromTelegram({ telegramId: 3, username: 'd', firstName: 'D' });
    expect(user.language).toBe('en');
  });
});
