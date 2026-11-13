import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RatesModule } from '../rates/rates.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { XrayModule } from '../xray/xray.module';
import { KeyPurchaseService } from './key-purchase.service';
import { KeySyncService } from './key-sync.service';

/** Key business logic: purchase, expiry and node sync. */
@Module({
  imports: [DatabaseModule, XrayModule, RatesModule, SubscriptionModule],
  providers: [KeyPurchaseService, KeySyncService],
  exports: [KeyPurchaseService, KeySyncService],
})
export class KeysModule {}
