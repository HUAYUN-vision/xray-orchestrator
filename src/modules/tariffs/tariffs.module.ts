import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TariffsAdminService } from './tariffs-admin.service';

/** Tariff management for admins. */
@Module({
  imports: [DatabaseModule],
  providers: [TariffsAdminService],
  exports: [TariffsAdminService],
})
export class TariffsModule {}
