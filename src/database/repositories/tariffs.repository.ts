import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Currency } from '../enums';
import { Tariff } from '../entities';

export interface NewTariff {
  durationDays: number;
  /** Non-negative decimal string. `0` is a free tariff. */
  price: string;
  currency: Currency;
  /** Bytes; `null` — unlimited. */
  trafficLimit: number | null;
}

@Injectable()
export class TariffsRepository {
  constructor(@InjectRepository(Tariff) private readonly repo: Repository<Tariff>) {}

  /** Tariffs on sale, shortest first. */
  findActive(): Promise<Tariff[]> {
    return this.repo.find({ where: { active: true }, order: { durationDays: 'ASC' } });
  }

  /** Every tariff, on sale first, then shortest. */
  findAll(): Promise<Tariff[]> {
    return this.repo.find({ order: { active: 'DESC', durationDays: 'ASC', price: 'ASC' } });
  }

  findActiveById(id: string): Promise<Tariff | null> {
    return this.repo.findOneBy({ id, active: true });
  }

  /** Active or hidden. */
  findById(id: string): Promise<Tariff | null> {
    return this.repo.findOneBy({ id });
  }

  create(input: NewTariff): Promise<Tariff> {
    return this.repo.save(this.repo.create({ ...input, active: true }));
  }

  /** `false` if there is no such tariff. */
  async setActive(id: string, active: boolean): Promise<boolean> {
    const result = await this.repo.update({ id }, { active });
    return result.affected === 1;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  countActive(): Promise<number> {
    return this.repo.countBy({ active: true });
  }
}
