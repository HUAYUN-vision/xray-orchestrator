import { Global, Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from '../../src/database/database.health';
import { BalanceRepository } from '../../src/database/repositories/balance.repository';
import { ServersRepository } from '../../src/database/repositories/servers.repository';
import { TariffsRepository } from '../../src/database/repositories/tariffs.repository';
import { UserKeysRepository } from '../../src/database/repositories/user-keys.repository';
import { UsersRepository } from '../../src/database/repositories/users.repository';
import { InMemoryUsersRepository } from './in-memory-users.repository';

const none = () => Promise.resolve(null);
const empty = () => Promise.resolve([]);

/** Replaces DatabaseModule in e2e tests: same exports, no Postgres. */
@Global()
@Module({
  providers: [
    { provide: UsersRepository, useClass: InMemoryUsersRepository },
    { provide: BalanceRepository, useValue: { findByUserId: none } },
    { provide: TariffsRepository, useValue: { findActive: empty, findActiveById: none } },
    { provide: ServersRepository, useValue: { findEnabled: empty, findAll: empty } },
    {
      provide: UserKeysRepository,
      useValue: {
        findActive: none,
        findOwned: none,
        findByUser: empty,
        findExpired: empty,
        findLiveIds: empty,
        findDeadIds: empty,
      },
    },
    {
      provide: DatabaseHealthIndicator,
      useValue: { check: () => Promise.resolve({ database: { status: 'up' } }) },
    },
  ],
  exports: [
    UsersRepository,
    BalanceRepository,
    TariffsRepository,
    ServersRepository,
    UserKeysRepository,
    DatabaseHealthIndicator,
  ],
})
export class FakeDatabaseModule {}
