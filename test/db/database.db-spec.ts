import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/database.config';
import {
  BalanceAccount,
  Server,
  Tariff,
  Transaction,
  User,
  UserKey,
} from '../../src/database/entities';
import {
  Currency,
  TransactionKind,
  TransactionType,
  UserKeyStatus,
} from '../../src/database/enums';
import { UserKeysRepository } from '../../src/database/repositories/user-keys.repository';
import { UsersRepository } from '../../src/database/repositories/users.repository';

/** Runs against a real Postgres in Docker: migrations, schema sync, constraints and repository queries. */
describe('Database (db)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let users: UsersRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    dataSource = await new DataSource(
      buildDataSourceOptions(container.getConnectionUri()),
    ).initialize();
    await dataSource.runMigrations();
    users = new UsersRepository(dataSource.getRepository(User), dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE users, balance_accounts, transactions, user_keys, tariffs, servers RESTART IDENTITY CASCADE',
    );
  });

  const newUser = (telegramId = 1) =>
    users.syncFromTelegram({ telegramId, username: null, firstName: 'U' });

  it('migrations match the entities', async () => {
    const sql = await dataSource.driver.createSchemaBuilder().log();
    expect(sql.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('all migrations can be reverted and applied again', async () => {
    const count = dataSource.migrations.length;
    for (let i = 0; i < count; i++) await dataSource.undoLastMigration();
    await expect(dataSource.runMigrations()).resolves.toHaveLength(count);
  });

  describe('UsersRepository', () => {
    it('creates a user with an empty balance account; telegram_id is a number', async () => {
      const user = await users.syncFromTelegram({
        telegramId: 7_000_000_001,
        username: 'ann',
        firstName: 'Ann',
      });
      expect(user).toMatchObject({ id: 1, telegramId: 7_000_000_001, language: null });
      expect(typeof user.telegramId).toBe('number');

      const balance = await dataSource.getRepository(BalanceAccount).findOneByOrFail({
        userId: user.id,
      });
      expect(balance).toMatchObject({ rub: '0.00000000', cny: '0.00000000', usdt: '0.00000000' });
      expect(balance.seqno).toBe(1);
    });

    it('updates the profile on change and keeps the same row and balance', async () => {
      const first = await newUser();
      const second = await users.syncFromTelegram({ telegramId: 1, username: 'a', firstName: 'B' });
      expect(second.id).toBe(first.id);
      expect(second).toMatchObject({ username: 'a', firstName: 'B' });
      expect(await dataSource.getRepository(User).count()).toBe(1);
      expect(await dataSource.getRepository(BalanceAccount).count()).toBe(1);
    });

    it('survives concurrent first syncs of the same user', async () => {
      const [a, b] = await Promise.all([newUser(2), newUser(2)]);
      expect(a.id).toBe(b.id);
      expect(await dataSource.getRepository(BalanceAccount).count()).toBe(1);
    });

    it('keeps the chosen language across syncs', async () => {
      await newUser(3);
      await users.setLanguage(3, 'en');
      const user = await users.syncFromTelegram({ telegramId: 3, username: 'd', firstName: 'D' });
      expect(user.language).toBe('en');
    });
  });

  describe('UserKeysRepository', () => {
    it('findActive returns only active, unexpired, not deleted keys', async () => {
      const user = await newUser();
      const tariff = await dataSource
        .getRepository(Tariff)
        .save({ durationDays: 30, price: '199', currency: Currency.RUB });
      const repo = dataSource.getRepository(UserKey);
      const base = { userId: user.id, tariffId: tariff.id };
      const future = new Date(Date.now() + 86_400_000);
      const [active, expired, past, deleted] = [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      await repo.insert([
        { ...base, id: active, expiresAt: future },
        { ...base, id: expired, expiresAt: future, status: UserKeyStatus.Expired },
        { ...base, id: past, expiresAt: new Date(Date.now() - 1000) },
        { ...base, id: deleted, expiresAt: future },
      ]);
      await repo.softDelete(deleted);

      const keys = new UserKeysRepository(repo);
      expect((await keys.findActive(active))?.id).toBe(active);
      for (const id of [expired, past, deleted, randomUUID()]) {
        expect(await keys.findActive(id)).toBeNull();
      }
    });
  });

  describe('constraints', () => {
    it('rejects a negative balance', async () => {
      const user = await newUser();
      await expect(
        dataSource.getRepository(BalanceAccount).update({ userId: user.id }, { rub: '-0.01' }),
      ).rejects.toThrow(/chk_balance_accounts_non_negative/);
    });

    it('keeps 8 decimal places exactly', async () => {
      const user = await newUser();
      const repo = dataSource.getRepository(BalanceAccount);
      await repo.update({ userId: user.id }, { usdt: '0.1' });
      await repo.increment({ userId: user.id }, 'usdt', '0.2');
      expect((await repo.findOneByOrFail({ userId: user.id })).usdt).toBe('0.30000000');
    });

    it('rejects a non-positive transaction amount', async () => {
      const user = await newUser();
      await expect(
        dataSource.getRepository(Transaction).insert({
          userId: user.id,
          amount: '0',
          currency: Currency.RUB,
          type: TransactionType.Credit,
          kind: TransactionKind.Deposit,
        }),
      ).rejects.toThrow(/chk_transactions_amount_positive/);
    });

    it('does not allow deleting a tariff that sold keys; deleting a user removes its data', async () => {
      const user = await newUser();
      const tariff = await dataSource
        .getRepository(Tariff)
        .save({ durationDays: 30, price: '199', currency: Currency.RUB });
      await dataSource.getRepository(UserKey).insert({
        id: randomUUID(),
        userId: user.id,
        tariffId: tariff.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await expect(dataSource.getRepository(Tariff).delete(tariff.id)).rejects.toThrow(
        /foreign key/,
      );

      await dataSource.getRepository(User).delete(user.id);
      expect(await dataSource.getRepository(UserKey).count({ withDeleted: true })).toBe(0);
      expect(await dataSource.getRepository(BalanceAccount).count()).toBe(0);
    });

    it('does not select the server api_key unless asked', async () => {
      await dataSource
        .getRepository(Server)
        .insert({ code: 'nl', host: 'nl.example.com', apiKey: 'k'.repeat(64) });
      const repo = dataSource.getRepository(Server);
      expect((await repo.findOneByOrFail({ code: 'nl' })).apiKey).toBeUndefined();
      const withKey = await repo.findOneOrFail({
        where: { code: 'nl' },
        select: { id: true, apiKey: true },
      });
      expect(withKey.apiKey).toHaveLength(64);
    });
  });
});
