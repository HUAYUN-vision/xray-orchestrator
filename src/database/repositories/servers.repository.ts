import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Server } from '../entities';

/** Server with its API key loaded (the column is not selected by default). */
export type ServerWithKey = Server & { apiKey: string };

const ALL_COLUMNS = {
  id: true,
  code: true,
  host: true,
  apiPort: true,
  apiKey: true,
  enabled: true,
  createdAt: true,
} as const;

export interface NewServer {
  code: string;
  host: string;
  apiPort: number;
  apiKey: string;
}

@Injectable()
export class ServersRepository {
  constructor(@InjectRepository(Server) private readonly repo: Repository<Server>) {}

  /** Servers new keys are created on, with API keys. */
  findEnabled(): Promise<ServerWithKey[]> {
    return this.repo.find({
      where: { enabled: true },
      select: ALL_COLUMNS,
      order: { code: 'ASC' },
    });
  }

  /** All servers, including disabled ones (they may still hold old clients). */
  findAll(): Promise<ServerWithKey[]> {
    return this.repo.find({ select: ALL_COLUMNS, order: { code: 'ASC' } });
  }

  findById(id: string): Promise<ServerWithKey | null> {
    return this.repo.findOne({
      where: { id },
      select: ALL_COLUMNS,
    });
  }

  /** Is the code or host already taken (unique columns). */
  async existsByCodeOrHost(code: string, host: string): Promise<boolean> {
    return this.repo.exists({ where: [{ code }, { host }] });
  }

  create(input: NewServer): Promise<ServerWithKey> {
    return this.repo.save(this.repo.create({ ...input, enabled: true }));
  }

  /** `false` if there is no such server. */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = await this.repo.update({ id }, { enabled });
    return result.affected === 1;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  countEnabled(): Promise<number> {
    return this.repo.countBy({ enabled: true });
  }
}
