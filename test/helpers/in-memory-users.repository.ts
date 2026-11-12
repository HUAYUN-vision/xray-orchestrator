import type { User } from '../../src/database/entities';
import type {
  TelegramProfile,
  UsersRepository,
} from '../../src/database/repositories/users.repository';

type PublicApi<T> = { [K in keyof T]: T[K] };

/** In-memory UsersRepository for unit and e2e tests (no database). */
export class InMemoryUsersRepository implements PublicApi<UsersRepository> {
  readonly users = new Map<number, User>();
  private nextId = 1;

  findByTelegramId(telegramId: number): Promise<User | null> {
    return Promise.resolve(this.users.get(telegramId) ?? null);
  }

  syncFromTelegram(profile: TelegramProfile): Promise<User> {
    const now = new Date();
    const existing = this.users.get(profile.telegramId);
    const user: User = existing
      ? { ...existing, ...profile, updatedAt: now }
      : { id: this.nextId++, language: null, createdAt: now, updatedAt: now, ...profile };
    this.users.set(profile.telegramId, user);
    return Promise.resolve(user);
  }

  setLanguage(telegramId: number, language: string | null): Promise<void> {
    const user = this.users.get(telegramId);
    if (user) user.language = language;
    return Promise.resolve();
  }
}
