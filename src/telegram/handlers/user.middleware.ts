import { Injectable } from '@nestjs/common';
import type { NextFunction } from 'grammy';
import { UsersRepository } from '../../database/repositories/users.repository';
import type { AppBot, BotContext } from '../bot-context';
import type { BotHandler } from '../bot-handler.interface';
import { getSender } from '../widget-query';

/** Loads (or creates) the sender as `ctx.user`. Must run before any middleware that needs the user. */
@Injectable()
export class UserMiddleware implements BotHandler {
  constructor(private readonly users: UsersRepository) {}

  register(bot: AppBot): void {
    bot.use((ctx, next) => this.handle(ctx, next));
  }

  async handle(ctx: BotContext, next: NextFunction): Promise<void> {
    const from = getSender(ctx);
    if (from && !from.is_bot) {
      ctx.user = await this.users.syncFromTelegram({
        telegramId: from.id,
        username: from.username ?? null,
        firstName: from.first_name,
      });
    }
    await next();
  }
}
