import { Module } from '@nestjs/common';
import { XrayNodeClient } from './xray-node.client';
import { XrayService } from './xray.service';

@Module({
  providers: [XrayNodeClient, XrayService],
  exports: [XrayService],
})
export class XrayModule {}
