import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Tariff } from '../entities';

@Injectable()
export class TariffsRepository {
  constructor(@InjectRepository(Tariff) private readonly repo: Repository<Tariff>) {}

  /** Tariffs on sale, shortest first. */
  findActive(): Promise<Tariff[]> {
    return this.repo.find({ where: { active: true }, order: { durationDays: 'ASC' } });
  }

  findActiveById(id: string): Promise<Tariff | null> {
    return this.repo.findOneBy({ id, active: true });
  }
}
