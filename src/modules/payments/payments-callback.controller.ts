import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { type CallbackPayload, PaymentsClient } from './payments.client';
import { TopUpService } from './top-up.service';

/**
 * Callback from payments-service: POST /{GLOBAL_PREFIX}/payments/callback.
 * Signed with HMAC over the raw body (needs `rawBody: true` in NestFactory.create).
 * Any non-2xx answer makes payments-service retry, so only DB failures end up as 5xx.
 */
@ApiExcludeController()
@Controller({ path: 'payments', version: VERSION_NEUTRAL })
export class PaymentsCallbackController {
  constructor(
    private readonly client: PaymentsClient,
    private readonly topUp: TopUpService,
  ) {}

  @Post('callback')
  @HttpCode(204)
  async callback(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payments-timestamp') timestamp: string | undefined,
    @Headers('x-payments-signature') signature: string | undefined,
    @Body() body: CallbackPayload,
  ): Promise<void> {
    if (!this.client.verifyCallback(req.rawBody, timestamp, signature)) {
      throw new UnauthorizedException('bad signature');
    }
    if (!body?.invoice || typeof body.event !== 'string') return;
    await this.topUp.handleCallback(body);
  }
}
