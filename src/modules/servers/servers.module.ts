import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { KeysModule } from '../keys/keys.module';
import { XrayModule } from '../xray/xray.module';
import { ServersAdminService } from './servers-admin.service';

/** Server management for admins (D19). */
@Module({
  imports: [DatabaseModule, KeysModule, XrayModule],
  providers: [ServersAdminService],
  exports: [ServersAdminService],
})
export class ServersModule {}
