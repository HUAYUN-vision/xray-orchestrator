import { Logger } from '@nestjs/common';
import type { WidgetRendererService } from '../../widget/widget-renderer.service';
import type { WidgetScreensService } from '../../widget/widget-screens.service';
import type { BotContext } from '../bot-context';
import type { WidgetApiService } from '../widget-api.service';
import { WidgetHandler } from './widget.handler';

const user = { id: 'u3', telegramId: 42, firstName: 'Ann' };
const home = { s: 'h', n: 1, b: { rub: '0.00', cny: '0.00', usdt: '0.00' }, k: [] };
const K = '11111111-1111-4111-8111-111111111111';
const URL = `https://x.test/api/sub/${K}`;
const keyScreen = (m?: string) => ({ s: 'k', n: 1, m, i: K, e: 1, a: 1, u: 1 });

describe('WidgetHandler', () => {
  let api: Record<string, jest.Mock>;
  let screens: Record<string, jest.Mock>;
  let handler: WidgetHandler;
  let sendMessage: jest.Mock;
  const order: string[] = [];

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    order.length = 0;
    api = {
      sendWidget: jest.fn().mockResolvedValue({}),
      answerWidgetQuery: jest.fn(() => (order.push('answer'), Promise.resolve(true))),
      editMessageWidgetData: jest.fn(() => (order.push('edit'), Promise.resolve(true))),
    };
    screens = {
      home: jest.fn().mockResolvedValue(home),
      execute: jest.fn(() => (order.push('execute'), Promise.resolve(home))),
      subscriptionUrl: jest.fn().mockResolvedValue(URL),
      key: jest.fn((_u: string, _k: string, m?: string) => Promise.resolve(keyScreen(m))),
    };
    sendMessage = jest.fn().mockResolvedValue({});
    const renderer = { render: jest.fn(() => ({ html: '<p>w</p>' })) };
    handler = new WidgetHandler(
      api as unknown as WidgetApiService,
      renderer as unknown as WidgetRendererService,
      screens as unknown as WidgetScreensService,
    );
  });

  const ctx = (extra: object = {}) =>
    ({
      user,
      chat: { id: 42 },
      locale: 'en',
      t: (key: string) => key,
      api: { sendMessage },
      ...extra,
    }) as unknown as BotContext;
  const query = (data: string) => ({
    id: 'q1',
    from: { id: 42 },
    data,
    chat: { id: 42 },
    message_id: 10,
  });

  it('sendHome sends the widget with queries allowed and the home state', async () => {
    await handler.sendHome(ctx());
    expect(api.sendWidget).toHaveBeenCalledWith({
      chat_id: 42,
      html: '<p>w</p>',
      caption: 'start',
      allow_queries: true,
      chat_data: JSON.stringify(home),
    });
  });

  it('answers first, then runs the command and updates the widget', async () => {
    await handler.handleQuery(ctx(), query('h') as never);
    expect(order).toEqual(['answer', 'execute', 'edit']);
    expect(api.answerWidgetQuery).toHaveBeenCalledWith({ widget_query_id: 'q1', data: 'ok' });
    expect(screens.execute).toHaveBeenCalledWith('u3', { c: 'home' });
    expect(api.editMessageWidgetData).toHaveBeenCalledWith({
      chat_id: 42,
      message_id: 10,
      chat_data: JSON.stringify(home),
    });
  });

  it('answers "bad" to an unknown command and does nothing else', async () => {
    await handler.handleQuery(ctx(), query('rm -rf') as never);
    expect(api.answerWidgetQuery).toHaveBeenCalledWith({ widget_query_id: 'q1', data: 'bad' });
    expect(screens.execute).not.toHaveBeenCalled();
  });

  it('survives a failed widget update', async () => {
    api.editMessageWidgetData.mockRejectedValue(new Error('message not found'));
    await expect(handler.handleQuery(ctx(), query('h') as never)).resolves.toBeUndefined();
  });

  it('sends the subscription link as a regular message with a copy button', async () => {
    await handler.handleQuery(ctx(), query(`l:${K}`) as never);
    expect(screens.subscriptionUrl).toHaveBeenCalledWith('u3', K);
    expect(sendMessage).toHaveBeenCalledWith(42, `sub-link\n\n<code>${URL}</code>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'sub-copy', copy_text: { text: URL } }]] },
    });
    expect(api.editMessageWidgetData).toHaveBeenCalledWith({
      chat_id: 42,
      message_id: 10,
      chat_data: JSON.stringify(keyScreen('link')),
    });
  });

  it('no link available: sends nothing, shows the key screen as is', async () => {
    screens.subscriptionUrl.mockResolvedValue(null);
    await handler.handleQuery(ctx(), query(`l:${K}`) as never);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(screens.execute).toHaveBeenCalledWith('u3', { c: 'key', keyId: K });
  });

  it('failed sendMessage shows an error on the key screen', async () => {
    sendMessage.mockRejectedValue(new Error('blocked'));
    await handler.handleQuery(ctx(), query(`l:${K}`) as never);
    expect(api.editMessageWidgetData).toHaveBeenCalledWith(
      expect.objectContaining({ chat_data: JSON.stringify(keyScreen('err')) }),
    );
  });
});
