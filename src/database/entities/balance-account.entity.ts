import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MONEY } from '../transformers';
import { User } from './user.entity';

/**
 * One row per user with a column per currency.
 * Amounts are decimal strings (pg `numeric`) — never convert them to float for arithmetic.
 */
@Entity({ name: 'balance_accounts' })
@Check('chk_balance_accounts_non_negative', 'rub >= 0 AND cny >= 0 AND usdt >= 0')
export class BalanceAccount {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ ...MONEY, default: 0 })
  rub: string;

  @Column({ ...MONEY, default: 0 })
  cny: string;

  @Column({ ...MONEY, default: 0 })
  usdt: string;

  /**
   * Incremented on every debit. A purchase passes the seqno it was shown,
   * so a double tap in the widget cannot pay twice.
   */
  @Column({ type: 'int', default: 1 })
  seqno: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
