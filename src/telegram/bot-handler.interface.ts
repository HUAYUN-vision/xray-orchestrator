import type { AppBot } from './bot-context';

/** A group of bot handlers. Each implementation attaches its middleware to the bot. */
export interface BotHandler {
  register(bot: AppBot): void;
  /** Optional one-off setup against the Bot API at startup (e.g. setMyCommands). */
  init?(bot: AppBot): Promise<void>;
}
