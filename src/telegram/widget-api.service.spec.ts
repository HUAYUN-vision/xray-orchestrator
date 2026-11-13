import type { AppBot } from './bot-context';
import { WidgetApiService } from './widget-api.service';

describe('WidgetApiService', () => {
  const sendWidget = jest.fn().mockResolvedValue({ message_id: 1 });
  const editMessageWidgetData = jest.fn().mockResolvedValue(true);
  const answerWidgetQuery = jest.fn().mockResolvedValue(true);
  const bot = {
    api: { raw: { sendWidget, editMessageWidgetData, answerWidgetQuery } },
  } as unknown as AppBot;
  const service = new WidgetApiService(bot);

  beforeEach(() => jest.clearAllMocks());

  it('calls the raw sendWidget method with the given params', async () => {
    const params = { chat_id: 42, html: '<b>hi</b>', allow_queries: true };
    await expect(service.sendWidget(params)).resolves.toEqual({ message_id: 1 });
    expect(sendWidget).toHaveBeenCalledWith(params);
  });

  it('calls editMessageWidgetData and answerWidgetQuery', async () => {
    await service.editMessageWidgetData({ chat_id: 42, message_id: 7, chat_data: '{}' });
    await service.answerWidgetQuery({ widget_query_id: 'q1', data: 'ok' });
    expect(editMessageWidgetData).toHaveBeenCalledWith({
      chat_id: 42,
      message_id: 7,
      chat_data: '{}',
    });
    expect(answerWidgetQuery).toHaveBeenCalledWith({ widget_query_id: 'q1', data: 'ok' });
  });

  it('rejects chat_data over 1024 bytes before calling the API', async () => {
    await expect(
      service.sendWidget({ chat_id: 1, html: 'x', chat_data: 'я'.repeat(513) }),
    ).rejects.toThrow(/chat_data is 1026 bytes/);
    expect(sendWidget).not.toHaveBeenCalled();
  });

  it('rejects html over 32 KB', async () => {
    await expect(service.sendWidget({ chat_id: 1, html: 'x'.repeat(32_769) })).rejects.toThrow(
      /html/,
    );
  });
});
