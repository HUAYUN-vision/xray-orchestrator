import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';
import { buildDataSourceOptions } from './database.config';
import { DatabaseHealthIndicator } from './database.health';
import { ENTITIES } from './entities';
import { BalanceRepository } from './repositories/balance.repository';
import { ServersRepository } from './repositories/servers.repository';
import { TariffsRepository } from './repositories/tariffs.repository';
import { UserKeysRepository } from './repositories/user-keys.repository';
import { UsersRepository } from './repositories/users.repository';

const REPOSITORIES = [
  UsersRepository,
  BalanceRepository,
  TariffsRepository,
  ServersRepository,
  UserKeysRepository,
];

/**
 * The only place that knows about TypeORM: connection, entities (schema is synchronized from them), repositories.
 * Other modules use the exported repositories.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildDataSourceOptions(config.get('DATABASE_URL'), {
          // `schema` logs the DDL that synchronize runs.
          logging: config.get('DB_LOGGING') ? 'all' : ['error', 'warn', 'schema'],
        }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
    TerminusModule,
  ],
  providers: [...REPOSITORIES, DatabaseHealthIndicator],
  exports: [...REPOSITORIES, DatabaseHealthIndicator],
})
export class DatabaseModule {}
