import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { SubscriptionService } from './subscription.service';

/** Subscription for VPN client apps: GET /{GLOBAL_PREFIX}/sub/{keyId}. */
@ApiExcludeController()
@Controller({ path: 'sub', version: VERSION_NEUTRAL })
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get(':keyId')
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('keyId', new ParseUUIDPipe({ version: '4' })) keyId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>[]> {
    const sub = await this.subscriptions.build(keyId);
    if (!sub) throw new NotFoundException();

    res.setHeader('Profile-Title', 'VPN');
    res.setHeader('Profile-Update-Interval', '1');
    res.setHeader('Subscription-Userinfo', sub.userInfo);
    return sub.configs;
  }
}
