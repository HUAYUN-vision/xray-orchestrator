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
import { InsufficientFundsError, StaleBalanceError } from '../../src/database/balance-ops';
import { BalanceRepository } from '../../src/database/repositories/balance.repository';
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

  describe('BalanceRepository', () => {
    let balance: BalanceRepository;
    beforeEach(() => {
      balance = new BalanceRepository(dataSource);
    });

    const deposit = (userId: number, amount: string, currency = Currency.RUB) =>
      balance.credit({ userId, currency, amount, kind: TransactionKind.Deposit });
    const pay = (userId: number, amount: string, expectedSeqno?: number) =>
      balance.debit({
        userId,
        currency: Currency.RUB,
        amount,
        kind: TransactionKind.Payment,
        expectedSeqno,
      });

    it('credits and debits exactly, writing the ledger; only debits bump seqno', async () => {
      const user = await newUser();
      await deposit(user.id, '100.1');
      await deposit(user.id, '0.00000001');
      expect(await balance.findByUserId(user.id)).toMatchObject({
        rub: '100.10000001',
        seqno: 1,
      });

      const tx = await pay(user.id, '100.10000001', 1);
      expect(tx).toMatchObject({ type: TransactionType.Debit, amount: '100.10000001' });
      expect(await balance.findByUserId(user.id)).toMatchObject({ rub: '0.00000000', seqno: 2 });
      expect(await dataSource.getRepository(Transaction).count()).toBe(3);
    });

    it('refuses to overdraw and leaves no ledger entry', async () => {
      const user = await newUser();
      await deposit(user.id, '10');
      await expect(pay(user.id, '10.00000001')).rejects.toThrow(InsufficientFundsError);
      expect(await balance.findByUserId(user.id)).toMatchObject({ rub: '10.00000000', seqno: 1 });
      expect(await dataSource.getRepository(Transaction).count()).toBe(1);
    });

    it('rejects a stale seqno (double tap pays once)', async () => {
      const user = await newUser();
      await deposit(user.id, '500');
      const results = await Promise.allSettled([pay(user.id, '199', 1), pay(user.id, '199', 1)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect(failed?.reason).toBeInstanceOf(StaleBalanceError);
      expect((await balance.findByUserId(user.id))?.rub).toBe('301.00000000');
    });

    it('serializes concurrent debits so the balance never goes negative', async () => {
      const user = await newUser();
      await deposit(user.id, '1000');
      const results = await Promise.allSettled(
        Array.from({ length: 15 }, () => pay(user.id, '100')),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect((await balance.findByUserId(user.id))?.rub).toBe('0.00000000');
    });

    it.each(['0', '-1', '1e3', '0.000000001', 'abc'])('rejects amount %p', async (amount) => {
      const user = await newUser();
      await expect(deposit(user.id, amount)).rejects.toThrow(RangeError);
    });
  });

  describe('UserKeysRepository', () => {
    let keys: UserKeysRepository;
    let tariffId: string;
    let userId: number;
    beforeEach(async () => {
      keys = new UserKeysRepository(dataSource.getRepository(UserKey), dataSource);
      userId = (await newUser()).id;
      tariffId = (
        await dataSource
          .getRepository(Tariff)
          .save({ durationDays: 30, price: '199', currency: Currency.RUB })
      ).id;
      await new BalanceRepository(dataSource).credit({
        userId,
        currency: Currency.RUB,
        amount: '300',
        kind: TransactionKind.Deposit,
      });
    });

    const newKey = (expiresAt = new Date(Date.now() + 86_400_000)) => ({
      id: randomUUID(),
      userId,
      tariffId,
      expiresAt,
      trafficLimit: null,
    });
    const rub = async () =>
      (await dataSource.getRepository(BalanceAccount).findOneByOrFail({ userId })).rub;

    it('createPaid charges and stores the key together', async () => {
      const input = newKey();
      const { key, payment } = await keys.createPaid(input, {
        currency: Currency.RUB,
        amount: '199',
        expectedSeqno: 1,
      });
      expect(key.id).toBe(input.id);
      expect(payment?.meta).toMatchObject({ tariffId, userKeyId: input.id });
      expect(await rub()).toBe('101.00000000');
    });

    it('createPaid stores nothing when the payment fails', async () => {
      const input = newKey();
      await expect(
        keys.createPaid(input, { currency: Currency.RUB, amount: '301' }),
      ).rejects.toThrow(InsufficientFundsError);
      expect(await dataSource.getRepository(UserKey).count({ withDeleted: true })).toBe(0);
      expect(await rub()).toBe('300.00000000');
    });

    it('cancelPaid removes the key and refunds exactly once', async () => {
      const input = newKey();
      const { payment } = await keys.createPaid(input, { currency: Currency.RUB, amount: '199' });
      const results = await Promise.all([
        keys.cancelPaid(input.id, payment, 'creation_failed'),
        keys.cancelPaid(input.id, payment, 'creation_failed'),
      ]);
      expect(results.sort()).toEqual([false, true]);
      expect(await rub()).toBe('300.00000000');
      expect(await keys.findActive(input.id)).toBeNull();
      const refund = await dataSource
        .getRepository(Transaction)
        .findOneByOrFail({ kind: TransactionKind.Refund });
      expect(refund.meta).toEqual({ transactionId: payment?.id, reason: 'creation_failed' });
    });

    it('expiry: findExpired → markExpired; live and dead ids for node sync', async () => {
      const live = newKey();
      const past = newKey(new Date(Date.now() - 1000));
      const deleted = newKey();
      for (const k of [live, past, deleted]) await keys.createPaid(k, null);
      await dataSource.getRepository(UserKey).softDelete(deleted.id);

      const expired = await keys.findExpired(new Date(), 10);
      expect(expired.map((k) => k.id)).toEqual([past.id]);
      expect(await keys.markExpired([past.id, live.id])).toEqual([past.id]);
      expect(await keys.markExpired([past.id])).toEqual([]);
      expect(await keys.findExpired(new Date(), 10)).toEqual([]);

      expect(await keys.findLiveIds()).toEqual([live.id]);
      const unknown = randomUUID();
      const dead = await keys.findDeadIds([live.id, past.id, deleted.id, unknown]);
      expect(dead.sort()).toEqual([past.id, deleted.id].sort());
    });
  });

  describe('UserKeysRepository.findActive', () => {
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

      const keys = new UserKeysRepository(repo, dataSource);
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
