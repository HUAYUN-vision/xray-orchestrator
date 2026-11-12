import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';
import { buildDataSourceOptions } from './database.config';
import { DatabaseHealthIndicator } from './database.health';
import { ENTITIES } from './entities';
import { UsersRepository } from './repositories/users.repository';

/**
 * The only place that knows about TypeORM: connection, entities, migrations, repositories.
 * Other modules use the exported repositories.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildDataSourceOptions(config.get('DATABASE_URL'), {
          migrationsRun: config.get('DB_MIGRATIONS_RUN'),
          logging: config.get('DB_LOGGING') ? 'all' : ['error', 'warn', 'migration'],
        }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
    TerminusModule,
  ],
  providers: [UsersRepository, DatabaseHealthIndicator],
  exports: [UsersRepository, DatabaseHealthIndicator],
})
export class DatabaseModule {}
