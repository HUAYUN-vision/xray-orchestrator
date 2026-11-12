import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from '../entities';

/** Profile fields taken from a Telegram update. */
export interface TelegramProfile {
  telegramId: number;
  username: string | null;
  firstName: string;
}

@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByTelegramId(telegramId: number): Promise<User | null> {
    return this.repo.findOneBy({ telegramId });
  }

  /**
   * Returns the user, creating it or refreshing the profile when needed.
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
    // Upsert also covers two concurrent first updates from the same user.
    await this.repo.upsert(profile, { conflictPaths: ['telegramId'] });
    return this.repo.findOneByOrFail({ telegramId: profile.telegramId });
  }

  async setLanguage(telegramId: number, language: string | null): Promise<void> {
    await this.repo.update({ telegramId }, { language });
  }
}
