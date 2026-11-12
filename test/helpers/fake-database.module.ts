import { Global, Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from '../../src/database/database.health';
import { ServersRepository } from '../../src/database/repositories/servers.repository';
import { UserKeysRepository } from '../../src/database/repositories/user-keys.repository';
import { UsersRepository } from '../../src/database/repositories/users.repository';
import { InMemoryUsersRepository } from './in-memory-users.repository';

/** Replaces DatabaseModule in e2e tests: same exports, no Postgres. */
@Global()
@Module({
  providers: [
    { provide: UsersRepository, useClass: InMemoryUsersRepository },
    { provide: ServersRepository, useValue: { findEnabled: () => Promise.resolve([]) } },
    { provide: UserKeysRepository, useValue: { findActive: () => Promise.resolve(null) } },
    {
      provide: DatabaseHealthIndicator,
      useValue: { check: () => Promise.resolve({ database: { status: 'up' } }) },
    },
  ],
  exports: [UsersRepository, ServersRepository, UserKeysRepository, DatabaseHealthIndicator],
})
export class FakeDatabaseModule {}
