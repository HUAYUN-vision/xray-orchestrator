import { Bot } from 'grammy';
import type { BotContext } from '../../src/telegram/bot-context';

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

/**
 * Real grammY Bot without network: botInfo is preset, start/stop are stubbed
 * and every Bot API call is recorded and answered with `{ ok: true }`.
 */
export function makeOfflineBot(): { bot: Bot<BotContext>; calls: ApiCall[] } {
  const calls: ApiCall[] = [];
  const bot = new Bot<BotContext>('123456:test-token', {
    botInfo: {
      id: 123456,
      is_bot: true,
      first_name: 'Test',
      username: 'test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
    } as Bot['botInfo'],
  });
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    // Transformers must return the raw API envelope.
    return Promise.resolve({ ok: true, result: true } as never);
  });
  jest.spyOn(bot, 'start').mockResolvedValue(undefined);
  jest.spyOn(bot, 'stop').mockResolvedValue(undefined);
  return { bot, calls };
}

/** A private-chat text message update; commands get a bot_command entity. */
export function textUpdate(
  text: string,
  from: { id: number; language_code?: string } = { id: 42 },
  updateId = 1,
) {
  const command = /^\/\w+/.exec(text)?.[0];
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: from.id, type: 'private' as const, first_name: 'U' },
      from: { is_bot: false, first_name: 'U', ...from },
      text,
      entities: command
        ? [{ type: 'bot_command' as const, offset: 0, length: command.length }]
        : [],
    },
  };
}
