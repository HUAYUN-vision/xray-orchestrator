import type { User } from 'grammy/types';
import type { BotContext } from './bot-context';
import type { WidgetQuery } from './types/widget';

/** `update.widget_query` (Bot API 10.4; grammY does not know this update type yet). */
export function getWidgetQuery(ctx: BotContext): WidgetQuery | undefined {
  return (ctx.update as { widget_query?: WidgetQuery } | undefined)?.widget_query;
}

/** Sender of the update, including widget queries that `ctx.from` does not cover. */
export function getSender(ctx: BotContext): User | undefined {
  return ctx.from ?? getWidgetQuery(ctx)?.from;
}
