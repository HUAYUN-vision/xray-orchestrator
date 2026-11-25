import { Injectable, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Tariff } from '../../database/entities';
import { type NewTariff, TariffsRepository } from '../../database/repositories/tariffs.repository';
import { UserKeysRepository } from '../../database/repositories/user-keys.repository';

export type TariffsAdminErrorCode = 'not_found' | 'in_use';

export class TariffsAdminError extends Error {
  constructor(
    readonly code: TariffsAdminErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TariffsAdminError';
  }
}

export interface TariffStatus {
  tariff: Tariff;
  /** Keys sold on it, including ones the user removed. */
  keys: number;
}

export interface TariffChange extends TariffStatus {
  /** Nothing is on sale: the shop is empty. */
  noneActive: boolean;
}

/**
 * Tariff management for admins.
 * - add: the tariff goes on sale immediately;
 * - hide: it disappears from the shop, keys already bought stay valid;
 * - delete: only when nobody bought it (`user_keys.tariff_id` is ON DELETE RESTRICT).
 *   A reference used only for auto-renew is cleared by the schema (ON DELETE SET NULL).
 */
@Injectable()
export class TariffsAdminService {
  private readonly logger = new Logger(TariffsAdminService.name);

  constructor(
    private readonly tariffs: TariffsRepository,
    private readonly keys: UserKeysRepository,
  ) {}

  async list(): Promise<TariffStatus[]> {
    const tariffs = await this.tariffs.findAll();
    const counts = await Promise.all(tariffs.map((t) => this.keys.countByTariff(t.id)));
    return tariffs.map((tariff, i) => ({ tariff, keys: counts[i] }));
  }

  async add(input: NewTariff): Promise<TariffChange> {
    const tariff = await this.tariffs.create(input);
    this.logger.log(
      `Tariff ${tariff.id} added: ${tariff.durationDays}d ${tariff.price} ${tariff.currency}`,
    );
    return this.change(tariff);
  }

  /** `active: false` hides the tariff from sale. */
  async setActive(id: string, active: boolean): Promise<TariffChange> {
    if (!(await this.tariffs.setActive(id, active))) throw new TariffsAdminError('not_found');
    const tariff = await this.mustGet(id);
    this.logger.log(`Tariff ${tariff.id} ${active ? 'shown' : 'hidden'}`);
    return this.change(tariff);
  }

  /**
   * Deletes a tariff nobody bought. A purchase that lands between the check and the
   * delete hits the foreign key and is reported as `in_use` too.
   */
  async remove(id: string): Promise<TariffChange> {
    const tariff = await this.mustGet(id);
    if ((await this.keys.countByTariff(id)) > 0) throw new TariffsAdminError('in_use');
    try {
      await this.tariffs.delete(id);
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new TariffsAdminError('in_use');
      throw err;
    }
    this.logger.log(`Tariff ${tariff.id} deleted`);
    return this.change(tariff);
  }

  async get(id: string): Promise<TariffStatus> {
    const tariff = await this.mustGet(id);
    return { tariff, keys: await this.keys.countByTariff(id) };
  }

  private async mustGet(id: string): Promise<Tariff> {
    const tariff = await this.tariffs.findById(id);
    if (!tariff) throw new TariffsAdminError('not_found');
    return tariff;
  }

  private async change(tariff: Tariff): Promise<TariffChange> {
    const [keys, active] = await Promise.all([
      this.keys.countByTariff(tariff.id),
      this.tariffs.countActive(),
    ]);
    return { tariff, keys, noneActive: active === 0 };
  }
}

/** Postgres `foreign_key_violation`. */
function isForeignKeyViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string };
  return driver.code === '23503';
}
