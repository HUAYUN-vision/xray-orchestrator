/** DI token for the grammY `Bot` instance. */
export const BOT = Symbol('BOT');

/** DI token for the list of handlers registered on the bot. */
export const BOT_HANDLERS = Symbol('BOT_HANDLERS');

/**
 * Update types the bot subscribes to. `widget_query` comes from Bot API 10.4
 * and is not in grammY's typings yet, so the list is typed as plain strings.
 */
export const ALLOWED_UPDATES: readonly string[] = ['message', 'callback_query', 'widget_query'];
