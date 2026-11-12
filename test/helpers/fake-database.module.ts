import { Global, Module } from '@nestjs/common';
import { DatabaseHealthIndicator } from '../../src/database/database.health';
import { UsersRepository } from '../../src/database/repositories/users.repository';
import { InMemoryUsersRepository } from './in-memory-users.repository';

/** Replaces DatabaseModule in e2e tests: same exports, no Postgres. */
@Global()
@Module({
  providers: [
    { provide: UsersRepository, useClass: InMemoryUsersRepository },
    {
      provide: DatabaseHealthIndicator,
      useValue: { check: () => Promise.resolve({ database: { status: 'up' } }) },
    },
  ],
  exports: [UsersRepository, DatabaseHealthIndicator],
})
export class FakeDatabaseModule {}
