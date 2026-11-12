import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../../database/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 1000 }), DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
