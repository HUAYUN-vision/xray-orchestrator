import { Logger } from '@nestjs/common';
import { I18nService } from '../../i18n/i18n.service';
import type { AppBot } from '../bot-context';
import { CommandsHandler } from './commands.handler';
import { makeCtx } from '../../../test/helpers/make-ctx';

describe('CommandsHandler', () => {
  const i18n = new I18nService();
  const handler = new CommandsHandler(i18n);

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('/start greets the user by name in their language', async () => {
    const { ctx, reply } = makeCtx(i18n, { locale: 'en' });
    await handler.start(ctx);
    expect(reply).toHaveBeenCalledWith(expect.stringMatching(/^Hi, Ann!/));
  });

  it('/help lists the commands', async () => {
    const { ctx, reply } = makeCtx(i18n);
    await handler.help(ctx);
    const text = reply.mock.calls[0][0];
    expect(text).toContain('/start');
    expect(text).toContain('/language');
  });

  it('registers both commands on the bot', () => {
    const command = jest.fn<void, [string, unknown]>();
    handler.register({ command } as unknown as AppBot);
    expect(command.mock.calls.map((c) => c[0])).toEqual(['start', 'help']);
  });

  it('sets a localized command menu per locale plus the default one', async () => {
    const setMyCommands = jest.fn().mockResolvedValue(true);
    await handler.init({ api: { setMyCommands } } as unknown as AppBot);

    expect(setMyCommands).toHaveBeenCalledWith(
      expect.arrayContaining([{ command: 'help', description: 'Help' }]),
      { language_code: 'en' },
    );
    expect(setMyCommands).toHaveBeenCalledWith(
      expect.arrayContaining([{ command: 'help', description: 'Справка' }]),
    );
  });

  it('does not throw when setting the menu fails', async () => {
    const setMyCommands = jest.fn().mockRejectedValue(new Error('network'));
    await expect(
      handler.init({ api: { setMyCommands } } as unknown as AppBot),
    ).resolves.toBeUndefined();
  });
});
