import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Currency } from '../enums';
import { MONEY, bigintToNumber } from '../transformers';

/**
 * What a user can buy. The price is set in one currency; paying from another balance
 * converts it at the current rate (done by the purchase logic, not here).
 */
@Entity({ name: 'tariffs' })
@Check('chk_tariffs_days_positive', 'duration_days > 0')
@Check('chk_tariffs_price_non_negative', 'price >= 0')
export class Tariff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'duration_days', type: 'int' })
  durationDays: number;

  @Column({ ...MONEY })
  price: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'currency', default: Currency.RUB })
  currency: Currency;

  /** Traffic limit in bytes; `null` — unlimited. */
  @Column({ name: 'traffic_limit', type: 'bigint', nullable: true, transformer: bigintToNumber })
  trafficLimit: number | null;

  /** Inactive tariffs are hidden from sale but keep existing keys valid. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
