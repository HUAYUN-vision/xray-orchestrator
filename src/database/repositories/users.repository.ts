import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { BalanceAccount, User } from '../entities';

/** Profile fields taken from a Telegram update. */
export interface TelegramProfile {
  telegramId: number;
  username: string | null;
  firstName: string;
}

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  findByTelegramId(telegramId: number): Promise<User | null> {
    return this.repo.findOneBy({ telegramId });
  }

  /**
   * Returns the user, creating it (with an empty balance account) or refreshing the profile when needed.
   * Common path (known user, unchanged profile) is a single SELECT.
   */
  async syncFromTelegram(profile: TelegramProfile): Promise<User> {
    const existing = await this.findByTelegramId(profile.telegramId);
    if (
      existing &&
      existing.username === profile.username &&
      existing.firstName === profile.firstName
    ) {
      return existing;
    }

    return this.dataSource.transaction(async (manager) => {
      // Upsert also covers two concurrent first updates from the same user.
      await manager.upsert(User, profile, { conflictPaths: ['telegramId'] });
      const user = await manager.findOneByOrFail(User, { telegramId: profile.telegramId });
      await manager
        .createQueryBuilder()
        .insert()
        .into(BalanceAccount)
        .values({ userId: user.id })
        .orIgnore()
        .execute();
      return user;
    });
  }

  async setLanguage(telegramId: number, language: string | null): Promise<void> {
    await this.repo.update({ telegramId }, { language });
  }
}
