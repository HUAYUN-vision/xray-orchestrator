import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { DataSource } from 'typeorm';

/** Readiness check for the database, so HealthModule does not touch TypeORM directly. */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check(key = 'database') {
    const status = this.indicator.check(key);
    try {
      await this.dataSource.query('SELECT 1');
      return status.up();
    } catch (err) {
      return status.down({ message: err instanceof Error ? err.message : String(err) });
    }
  }
}
