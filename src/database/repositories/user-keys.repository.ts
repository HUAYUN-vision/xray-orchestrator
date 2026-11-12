import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, type Repository } from 'typeorm';
import { UserKey } from '../entities';
import { UserKeyStatus } from '../enums';

@Injectable()
export class UserKeysRepository {
  constructor(@InjectRepository(UserKey) private readonly repo: Repository<UserKey>) {}

  /** An active, not expired, not deleted key. */
  findActive(id: string): Promise<UserKey | null> {
    return this.repo.findOneBy({
      id,
      status: UserKeyStatus.Active,
      expiresAt: MoreThan(new Date()),
    });
  }
}
