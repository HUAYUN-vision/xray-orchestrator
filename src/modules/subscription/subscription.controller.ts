import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { detectFormat, SubscriptionService } from './subscription.service';

/**
 * Subscription for VPN client apps: GET /{GLOBAL_PREFIX}/sub/{keyId}.
 * Format by User-Agent: sing-box for Hiddify, xray-json for everyone else.
 */
@ApiExcludeController()
@Controller({ path: 'sub', version: VERSION_NEUTRAL })
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get(':keyId')
  @Header('Cache-Control', 'no-store')
  async get(
    @Param('keyId', new ParseUUIDPipe({ version: '4' })) keyId: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>[] | Record<string, unknown>> {
    const sub = await this.subscriptions.build(keyId, detectFormat(userAgent));
    if (!sub) throw new NotFoundException();

    res.setHeader('Profile-Title', 'VPN');
    res.setHeader('Profile-Update-Interval', '1');
    res.setHeader('Subscription-Userinfo', sub.userInfo);
    return sub.body;
  }
}
