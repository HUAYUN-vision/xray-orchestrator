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
}
