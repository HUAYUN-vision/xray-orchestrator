import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  type BalanceMovement,
  type DebitMovement,
  creditBalance,
  debitBalance,
} from '../balance-ops';
import { BalanceAccount, type Transaction } from '../entities';

/** Balance reads and standalone balance operations; each operation is its own DB transaction. */
@Injectable()
export class BalanceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  findByUserId(userId: number): Promise<BalanceAccount | null> {
    return this.dataSource.getRepository(BalanceAccount).findOneBy({ userId });
  }

  credit(movement: BalanceMovement): Promise<Transaction> {
    return this.dataSource.transaction((manager) => creditBalance(manager, movement));
  }

  debit(movement: DebitMovement): Promise<Transaction> {
    return this.dataSource.transaction((manager) => debitBalance(manager, movement));
  }
}
