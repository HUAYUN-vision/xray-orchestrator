import {
  Controller,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type Bot, webhookCallback } from 'grammy';
import { AppConfigService } from '../config/app-config.service';
import { BOT } from './telegram.constants';

/** Receives updates from Telegram in webhook mode: POST /{GLOBAL_PREFIX}/telegram/webhook. */
@ApiExcludeController()
@Controller({ path: 'telegram', version: VERSION_NEUTRAL })
export class TelegramWebhookController {
  private readonly handle?: (req: Request, res: Response) => Promise<void>;

  constructor(@Inject(BOT) bot: Bot, config: AppConfigService) {
    if (config.get('BOT_MODE') === 'webhook') {
      // Checks the X-Telegram-Bot-Api-Secret-Token header and answers 401 on mismatch.
      this.handle = webhookCallback(bot, 'express', {
        secretToken: config.get('WEBHOOK_SECRET'),
      });
    }
  }

  @Post('webhook')
  async webhook(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.handle) throw new NotFoundException();
    await this.handle(req, res);
  }
}
