import { Inject, Injectable } from '@nestjs/common';
import type { Bot } from 'grammy';
import type { Message } from 'grammy/types';
import { BOT } from './telegram.constants';
import {
  type AnswerWidgetQueryParams,
  type EditMessageWidgetDataParams,
  type SendWidgetParams,
  type Widget,
  WIDGET_LIMITS,
} from './types/widget';

type RawCall = (payload: object) => Promise<unknown>;

/**
 * Bot API 10.4 widget methods via `bot.api.raw`. grammY has no typings for them yet;
 * `raw` is a Proxy, so any method name maps to a real API call.
 * Remove this wrapper once grammY supports 10.4.
 */
@Injectable()
export class WidgetApiService {
  constructor(@Inject(BOT) private readonly bot: Bot) {}

  async sendWidget(params: SendWidgetParams): Promise<Message & { widget?: Widget }> {
    assertMaxBytes('html', params.html, WIDGET_LIMITS.htmlBytes);
    assertMaxBytes('chat_data', params.chat_data, WIDGET_LIMITS.dataBytes);
    assertMaxBytes('public_data', params.public_data, WIDGET_LIMITS.dataBytes);
    return (await this.call('sendWidget', params)) as Message & { widget?: Widget };
  }

  async editMessageWidgetData(params: EditMessageWidgetDataParams): Promise<true | Message> {
    assertMaxBytes('chat_data', params.chat_data, WIDGET_LIMITS.dataBytes);
    assertMaxBytes('public_data', params.public_data, WIDGET_LIMITS.dataBytes);
    return (await this.call('editMessageWidgetData', params)) as true | Message;
  }

  async answerWidgetQuery(params: AnswerWidgetQueryParams): Promise<true> {
    assertMaxBytes('data', params.data, WIDGET_LIMITS.answerDataBytes);
    return (await this.call('answerWidgetQuery', params)) as true;
  }

  private call(method: string, payload: object): Promise<unknown> {
    const raw = this.bot.api.raw as unknown as Record<string, RawCall>;
    return raw[method](payload);
  }
}

function assertMaxBytes(field: string, value: string | undefined, max: number): void {
  if (value === undefined) return;
  const size = Buffer.byteLength(value, 'utf8');
  if (size > max) {
    throw new RangeError(`Widget ${field} is ${size} bytes, limit is ${max}`);
  }
}
