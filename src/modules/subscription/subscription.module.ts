import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { XrayModule } from '../xray/xray.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [DatabaseModule, XrayModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
