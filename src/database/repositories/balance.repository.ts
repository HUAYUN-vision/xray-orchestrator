import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  type BalanceMovement,
  completeDeposit,
  createPendingDeposit,
  creditBalance,
  type DebitMovement,
  debitBalance,
  type DepositResult,
  failDeposit,
} from '../balance-ops';
import { BalanceAccount, type DepositMeta, Transaction } from '../entities';
import { type Currency, TransactionKind, TransactionStatus } from '../enums';

/** Balance reads and standalone balance operations; each operation is its own DB transaction. */
@Injectable()
export class BalanceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  findByUserId(userId: string): Promise<BalanceAccount | null> {
    return this.dataSource.getRepository(BalanceAccount).findOneBy({ userId });
  }

  credit(movement: BalanceMovement): Promise<Transaction> {
    return this.dataSource.transaction((manager) => creditBalance(manager, movement));
  }

  debit(movement: DebitMovement): Promise<Transaction> {
    return this.dataSource.transaction((manager) => debitBalance(manager, movement));
  }

  createDeposit(movement: Omit<BalanceMovement, 'kind'>): Promise<Transaction> {
    return this.dataSource.transaction((manager) => createPendingDeposit(manager, movement));
  }

  /** Merges fields into the meta of a pending deposit (invoice id, payment link). */
  async updateDepositMeta(depositId: string, meta: Partial<DepositMeta>): Promise<void> {
    await this.dataSource.query(
      `UPDATE transactions SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
        WHERE id = $1 AND kind = $3 AND status = $4`,
      [depositId, JSON.stringify(meta), TransactionKind.Deposit, TransactionStatus.Pending],
    );
  }

  /**
   * A recent unpaid deposit of the user with the same amount and a payment link:
   * a repeated tap reuses it instead of creating another invoice.
   */
  findReusableDeposit(
    userId: string,
    currency: Currency,
    amount: string,
    since: Date,
  ): Promise<Transaction | null> {
    return this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .where('t.user_id = :userId AND t.currency = :currency AND t.amount = :amount', {
        userId,
        currency,
        amount,
      })
      .andWhere('t.kind = :kind AND t.status = :status AND t.created_at >= :since', {
        kind: TransactionKind.Deposit,
        status: TransactionStatus.Pending,
        since,
      })
      .andWhere("t.meta ? 'paymentUrl'")
      .orderBy('t.created_at', 'DESC')
      .getOne();
  }

  findDeposit(depositId: string): Promise<Transaction | null> {
    return this.dataSource
      .getRepository(Transaction)
      .findOneBy({ id: depositId, kind: TransactionKind.Deposit });
  }

  completeDeposit(depositId: string, meta?: Partial<DepositMeta>): Promise<DepositResult | null> {
    return this.dataSource.transaction((manager) => completeDeposit(manager, depositId, meta));
  }

  failDeposit(depositId: string): Promise<DepositResult | null> {
    return this.dataSource.transaction((manager) => failDeposit(manager, depositId));
  }
}
