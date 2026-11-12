import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Currency, TransactionKind, TransactionStatus, TransactionType } from '../enums';
import { MONEY } from '../transformers';
import { User } from './user.entity';

export interface DepositMeta {
  /** Payment provider, e.g. `yookassa`, `wechat`, `crypto`. */
  provider: string;
  /** Payment id on the provider's side. */
  paymentId?: string;
}

export interface PaymentMeta {
  tariffId: string;
  userKeyId: string;
  /** Price in the tariff currency and the rate used, when paid in another currency. */
  price?: { amount: string; currency: Currency; rate?: string };
}

export interface RefundMeta {
  /** Transaction being refunded. */
  transactionId: string;
  reason?: string;
}

export interface ExchangeMeta {
  /** The paired transaction in the other currency. */
  pairedTransactionId: string;
  rate: string;
}

export interface AdjustmentMeta {
  /** Admin who made the change. */
  byUserId?: number;
  comment?: string;
}

export type TransactionMeta =
  DepositMeta | PaymentMeta | RefundMeta | ExchangeMeta | AdjustmentMeta;

/** Append-only ledger of balance movements. `amount` is always positive; direction is `type`. */
@Entity({ name: 'transactions' })
@Index(['userId', 'createdAt'])
@Check('chk_transactions_amount_positive', 'amount > 0')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ ...MONEY })
  amount: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'currency' })
  currency: Currency;

  @Column({ type: 'enum', enum: TransactionType, enumName: 'transaction_type' })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionKind, enumName: 'transaction_kind' })
  kind: TransactionKind;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status',
    default: TransactionStatus.Completed,
  })
  status: TransactionStatus;

  @Column({ type: 'jsonb', nullable: true })
  meta: TransactionMeta | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
