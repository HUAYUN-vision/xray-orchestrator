import { Module } from '@nestjs/common';
import { CbrClient } from './cbr.client';
import { ExchangeRatesService } from './exchange-rates.service';

@Module({
  providers: [CbrClient, ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class RatesModule {}
