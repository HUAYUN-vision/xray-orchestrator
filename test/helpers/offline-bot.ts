import { Bot } from 'grammy';

/** Real grammY Bot with no network: botInfo is preset, start/stop are stubbed. */
export function makeOfflineBot(): Bot {
  const bot = new Bot('123456:test-token', {
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
  jest.spyOn(bot, 'start').mockResolvedValue(undefined);
  jest.spyOn(bot, 'stop').mockResolvedValue(undefined);
  return bot;
}
