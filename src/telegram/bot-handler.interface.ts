import type { Bot } from 'grammy';

/** A group of bot handlers. Each implementation attaches its middleware to the bot. */
export interface BotHandler {
  register(bot: Bot): void;
}
