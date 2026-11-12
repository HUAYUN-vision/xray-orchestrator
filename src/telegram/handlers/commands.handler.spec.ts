import type { Context } from 'grammy';
import { CommandsHandler } from './commands.handler';

describe('CommandsHandler', () => {
  const handler = new CommandsHandler();
  const makeCtx = () => {
    const reply = jest.fn().mockResolvedValue(undefined);
    return { ctx: { reply } as unknown as Context, reply };
  };

  it('/start greets the user and points to /help', async () => {
    const { ctx, reply } = makeCtx();
    await handler.start(ctx);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('/help'));
  });

  it('/help lists the commands', async () => {
    const { ctx, reply } = makeCtx();
    await handler.help(ctx);
    const text = reply.mock.calls[0][0] as string;
    expect(text).toContain('/start');
    expect(text).toContain('/help');
  });

  it('registers both commands on the bot', () => {
    const command = jest.fn<void, [string, unknown]>();
    handler.register({ command } as never);
    expect(command.mock.calls.map((c) => c[0])).toEqual(['start', 'help']);
  });
});
