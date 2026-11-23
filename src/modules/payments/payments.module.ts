import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PaymentsCallbackController } from './payments-callback.controller';
import { PaymentsClient } from './payments.client';
import { TopUpService } from './top-up.service';

/** Balance top-up through payments-service (D20). */
@Module({
  imports: [DatabaseModule],
  controllers: [PaymentsCallbackController],
  providers: [PaymentsClient, TopUpService],
  exports: [TopUpService],
})
export class PaymentsModule {}
