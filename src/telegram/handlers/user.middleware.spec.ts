import type { UsersRepository } from '../../database/repositories/users.repository';
import { InMemoryUsersRepository } from '../../../test/helpers/in-memory-users.repository';
import type { BotContext } from '../bot-context';
import { UserMiddleware } from './user.middleware';

describe('UserMiddleware', () => {
  let users: InMemoryUsersRepository;
  let middleware: UserMiddleware;
  const next = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    users = new InMemoryUsersRepository();
    middleware = new UserMiddleware(users as unknown as UsersRepository);
    next.mockClear();
  });

  it('creates the user and puts it on the context', async () => {
    const ctx = {
      from: { id: 42, is_bot: false, first_name: 'Ann', username: 'ann' },
    } as BotContext;
    await middleware.handle(ctx, next);
    expect(ctx.user).toMatchObject({ telegramId: 42, firstName: 'Ann', username: 'ann' });
    expect(users.users.size).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  it('skips updates without a sender or from bots', async () => {
    const noSender = {} as BotContext;
    const fromBot = { from: { id: 1, is_bot: true, first_name: 'B' } } as BotContext;
    await middleware.handle(noSender, next);
    await middleware.handle(fromBot, next);
    expect(noSender.user).toBeUndefined();
    expect(fromBot.user).toBeUndefined();
    expect(users.users.size).toBe(0);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
