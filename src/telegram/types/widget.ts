/**
 * Bot API 10.4 (2026-11-09) widget types. grammY does not ship them yet.
 * Reference: https://core.telegram.org/bots/widgets
 */
import type { Chat, InlineKeyboardMarkup, User } from 'grammy/types';

/** Widget limits from the official documentation. */
export const WIDGET_LIMITS = {
  htmlBytes: 32_768,
  htmlCompressedBytes: 4_096,
  dataBytes: 1_024,
  queryDataMaxBytes: 64,
  answerDataBytes: 1_024,
  answerTimeoutMs: 15_000,
} as const;

/** `Message.widget` */
export interface Widget {
  /** Shared widget id, usable with `sendSharedWidget`. */
  id?: string;
  width?: number;
  height?: number;
  html: string;
  public_data?: string;
  chat_data?: string;
}

/** `Update.widget_query` */
export interface WidgetQuery {
  id: string;
  from: User;
  /** Request payload from `TelegramWidget.request(data)`, 1–64 bytes. */
  data: string;
  chat?: Chat;
  message_id?: number;
  inline_message_id?: string;
}

export interface SendWidgetParams {
  chat_id: number | string;
  html: string;
  caption?: string;
  /** Without it, every request from the widget is refused. */
  allow_queries?: boolean;
  is_shared?: boolean;
  public_data?: string;
  chat_data?: string;
  /** 0 = automatic. */
  width?: number;
  height?: number;
  reply_markup?: InlineKeyboardMarkup;
}

export type EditMessageWidgetDataParams = {
  chat_data?: string;
  public_data?: string;
} & (
  | { chat_id: number | string; message_id: number; inline_message_id?: never }
  | { inline_message_id: string; chat_id?: never; message_id?: never }
);

export interface AnswerWidgetQueryParams {
  widget_query_id: string;
  /** Up to 1024 bytes. Does not change the widget's state. */
  data?: string;
}
